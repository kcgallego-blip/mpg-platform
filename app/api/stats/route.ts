import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabase } from '@/lib/supabase'
import { getStatsWeekNumber, getStatsWeekRange } from '@/lib/statsUtils'

const FUZZY_NAME_MATCH_THRESHOLD = 60

const parseWeek = (value: string | null) => {
  if (value === null) return null
  const week = Number(value)
  return Number.isInteger(week) && week > 0 ? week : undefined
}

const parseMonth = (value: string | null) => {
  if (value === null) return null
  const month = Number(value)
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : undefined
}

const parsePeriodType = (value: string | null) => {
  return value === 'monthly' ? 'monthly' : 'weekly'
}

const normalizeNameForMatch = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const getNameTokens = (value: string | null | undefined) =>
  Array.from(new Set(normalizeNameForMatch(value).split(/\s+/).filter(Boolean)))

const getFuzzyNameScore = (statsName: string | null | undefined, userName: string | null | undefined) => {
  const normalizedStatsName = normalizeNameForMatch(statsName)
  const normalizedUserName = normalizeNameForMatch(userName)
  const userTokens = getNameTokens(userName)
  const statsTokens = getNameTokens(statsName)

  if (!normalizedStatsName || !normalizedUserName || userTokens.length === 0 || statsTokens.length === 0) {
    return 0
  }

  if (normalizedStatsName === normalizedUserName) return 100
  if (normalizedStatsName.includes(normalizedUserName) || normalizedUserName.includes(normalizedStatsName)) return 90

  const statsTokenSet = new Set(statsTokens)
  const userTokenSet = new Set(userTokens)
  const matchedUserTokens = userTokens.filter(token => statsTokenSet.has(token)).length
  const matchedStatsTokens = statsTokens.filter(token => userTokenSet.has(token)).length
  const firstToken = userTokens[0]
  const lastToken = userTokens[userTokens.length - 1]

  if (
    (firstToken && lastToken && statsTokenSet.has(firstToken) && statsTokenSet.has(lastToken)) ||
    matchedUserTokens === userTokens.length ||
    matchedStatsTokens === statsTokens.length
  ) {
    return 85
  }

  if (
    matchedUserTokens >= 2 &&
    ((firstToken && statsTokenSet.has(firstToken)) || (lastToken && statsTokenSet.has(lastToken)))
  ) {
    return 70
  }

  if (matchedUserTokens >= Math.ceil(userTokens.length * 0.6)) return 60

  return 0
}

export async function GET(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)

    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || ''

    // Get query parameters for filtering and searching
    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('search')?.toLowerCase() || ''
    const supervisorFilter = searchParams.get('supervisor')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const periodTypeParam = searchParams.get('periodType')
    const periodType = parsePeriodType(periodTypeParam)
    const periodValueParam = searchParams.get('period') ?? searchParams.get('week') ?? searchParams.get('month')
    const parsedWeek = parseWeek(periodValueParam)
    const parsedMonth = parseMonth(periodValueParam)
    const isMonthly = periodType === 'monthly'

    if (periodValueParam !== null && !isMonthly && parsedWeek === undefined) {
      return NextResponse.json({ error: 'Week must be a positive integer' }, { status: 400 })
    }

    if (periodValueParam !== null && isMonthly && parsedMonth === undefined) {
      return NextResponse.json({ error: 'Month must be between 1 and 12' }, { status: 400 })
    }

    const selectedWeek = parsedWeek ?? getStatsWeekNumber()
    const selectedMonth = parsedMonth ?? new Date().getMonth() + 1
    const selectedPeriodValue = isMonthly ? selectedMonth : selectedWeek

    // Validate sort parameters
    const validSortFields = [
      'name',
      'supervisor',
      'acw',
      'aht',
      'hold',
      'talk_time',
      'csat_score',
      'dsat',
      'nps_score',
      'mod',
      'mod_value',
      'fcr',
      'fcr_value',
      'surveys_answered',
      'tph',
      'week',
      'range',
      'created_at',
    ]
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'name'
    const safeOrder = sortOrder.toLowerCase() === 'desc' ? false : true

    const isAgent = userRole.toLowerCase() === 'agent'
    const isTeamLeader = userRole.toLowerCase() === 'team leader'
    const isSupervisor = userRole.toLowerCase() === 'supervisor'
    const isAdminOrManager = ['admin', 'manager'].includes(userRole.toLowerCase())
    const agentNameTokens = getNameTokens(userName)

    // Build the base query
    let query = supabase
      .from(isMonthly ? 'stats_month' : 'stats')
      .select('*')

    if (isMonthly) {
      query = query.eq('month', String(selectedPeriodValue))
    } else {
      query = query.eq('week', selectedWeek)
    }

    // Apply role-based filtering
    if (isAgent) {
      // Agents can only see stats rows that fuzzy-match their users.name value.
      if (agentNameTokens.length > 0) {
        const filters = agentNameTokens.map(token => `name.ilike.%${token}%`)
        query = query.or(filters.join(','))
      } else {
        query = query.eq('name', userName)
      }
    } else if (isTeamLeader || isSupervisor) {
      // Team leaders and supervisors can see stats of agents under them
      query = query.eq('supervisor', dbUser.name || '')
    } else if (isAdminOrManager && supervisorFilter && supervisorFilter !== 'all') {
      query = query.eq('supervisor', supervisorFilter)
    }
    // Admin/Manager roles can see all stats when no supervisor filter is selected

    query = query.order(safeSortBy, { ascending: safeOrder }).order('created_at', { ascending: false })

    const { data: rawStats, error: statsError } = await query

    if (statsError) {
      console.error('Stats fetch error:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const statsForWeek = isAgent
      ? (rawStats || [])
          .filter(stat => getFuzzyNameScore(stat.name, userName) >= FUZZY_NAME_MATCH_THRESHOLD)
          .sort((a, b) => {
            const scoreDiff = getFuzzyNameScore(b.name, userName) - getFuzzyNameScore(a.name, userName)
            if (scoreDiff !== 0) return scoreDiff
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
      : rawStats || []

    const selectedRange = isMonthly
      ? 1
      : statsForWeek.length > 0
        ? Math.max(...statsForWeek.map(stat => stat.range))
        : getStatsWeekRange()

    const stats = isMonthly
      ? statsForWeek
      : statsForWeek.filter(stat => stat.range === selectedRange)

    // If team leader/supervisor, also return list of unique supervisors for filtering
    let supervisors: string[] = []
    if (userRole.toLowerCase() !== 'agent') {
      const uniqueSupervisors = Array.from(
        new Set(statsForWeek.map(stat => stat.supervisor).filter(Boolean))
      )
      supervisors = uniqueSupervisors
    }

    return NextResponse.json({
      stats,
      supervisors,
      userRole,
      userName,
      range: selectedRange,
      periodType,
      periodValue: selectedPeriodValue,
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
