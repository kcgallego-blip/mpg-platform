import { NextRequest, NextResponse } from 'next/server'
import { STATS_COLUMNS, STATS_MONTH_COLUMNS } from '@/lib/dbColumns'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStatsWeekNumber, getStatsWeekRange } from '@/lib/statsUtils'
import type { Database } from '@/types/database'

const FUZZY_NAME_MATCH_THRESHOLD = 60
const MAX_PAGE_SIZE = 50
type StatsRow = Database['public']['Tables']['stats']['Row']

const parsePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

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

const resolveStatsAgentName = async ({
  isMonthly,
  periodValue,
  userName,
}: {
  isMonthly: boolean
  periodValue: number
  userName: string
}) => {
  const userTokens = getNameTokens(userName)
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])
  const commaIndex = userName.indexOf(',')
  const surnameTokens = commaIndex >= 0 ? getNameTokens(userName.slice(0, commaIndex)) : []
  const givenNameTokens = commaIndex >= 0 ? getNameTokens(userName.slice(commaIndex + 1)) : []
  const lastNameToken = commaIndex >= 0
    ? surnameTokens[surnameTokens.length - 1]
    : [...userTokens].reverse().find((token) => !suffixes.has(token))
  const firstNameToken = commaIndex >= 0 ? givenNameTokens[0] : userTokens[0]
  const anchorTokens = Array.from(new Set([firstNameToken, lastNameToken].filter(Boolean))) as string[]
  let candidateQuery = supabaseAdmin
    .from(isMonthly ? 'stats_month' : 'stats')
    .select('name')
    .limit(50)

  candidateQuery = isMonthly
    ? candidateQuery.eq('month', String(periodValue))
    : candidateQuery.eq('week', periodValue)
  anchorTokens.forEach((token) => {
    candidateQuery = candidateQuery.ilike('name', `%${token}%`)
  })

  const { data, error } = await candidateQuery
  if (error) throw error

  const candidates = Array.from(new Set(
    ((data || []) as Array<{ name?: string | null }>)
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name))
  ))

  let bestMatch: string | null = null
  let bestScore = 0
  let hasAmbiguousBestMatch = false
  candidates.forEach((candidate) => {
    const score = getFuzzyNameScore(candidate, userName)
    if (score > bestScore) {
      bestMatch = candidate
      bestScore = score
      hasAmbiguousBestMatch = false
    } else if (score === bestScore && score >= FUZZY_NAME_MATCH_THRESHOLD && candidate !== bestMatch) {
      hasAmbiguousBestMatch = true
    }
  })

  return bestScore >= FUZZY_NAME_MATCH_THRESHOLD && !hasAmbiguousBestMatch ? bestMatch : null
}

export async function GET(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)

    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || ''
    const isAgent = userRole.trim().toLowerCase() === 'agent'

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
    const page = parsePositiveInteger(searchParams.get('page'), 1)
    const pageSize = Math.min(parsePositiveInteger(searchParams.get('pageSize'), 50), MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize
    const resolvedAgentName = isAgent && userName
      ? await resolveStatsAgentName({ isMonthly, periodValue: selectedPeriodValue, userName })
      : null

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

    // Build the base query
    let query = supabaseAdmin
      .from(isMonthly ? 'stats_month' : 'stats')
      .select(isMonthly ? STATS_MONTH_COLUMNS : STATS_COLUMNS, { count: 'exact' })

    if (isMonthly) {
      query = query.eq('month', String(selectedPeriodValue))
    } else {
      query = query.eq('week', selectedWeek)
    }

    if (isAgent) {
      query = query.eq('name', resolvedAgentName || '__mpg_no_agent_match__')
    }
    if (supervisorFilter && supervisorFilter !== 'all') {
      query = query.eq('supervisor', supervisorFilter)
    }
    if (searchQuery) {
      const search = searchQuery.replace(/[(),]/g, ' ').trim()
      query = query.or(`name.ilike.%${search}%,supervisor.ilike.%${search}%`)
    }

    let selectedRange = 1
    if (!isMonthly) {
      let rangeQuery = supabaseAdmin
        .from('stats')
        .select('range')
        .eq('week', selectedWeek)
        .order('range', { ascending: false })
        .limit(1)

      if (isAgent) {
        rangeQuery = rangeQuery.eq('name', resolvedAgentName || '__mpg_no_agent_match__')
      }
      if (supervisorFilter && supervisorFilter !== 'all') {
        rangeQuery = rangeQuery.eq('supervisor', supervisorFilter)
      }
      if (searchQuery) {
        const search = searchQuery.replace(/[(),]/g, ' ').trim()
        rangeQuery = rangeQuery.or(`name.ilike.%${search}%,supervisor.ilike.%${search}%`)
      }

      const { data: latestRangeRows, error: latestRangeError } = await rangeQuery
      if (latestRangeError) throw latestRangeError
      selectedRange = Number(latestRangeRows?.[0]?.range) || getStatsWeekRange()
      query = query.eq('range', selectedRange)
    }

    query = query
      .order(safeSortBy, { ascending: safeOrder })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    let supervisorQuery = supabaseAdmin
      .from(isMonthly ? 'stats_month' : 'stats')
      .select('supervisor')
    supervisorQuery = isMonthly
      ? supervisorQuery.eq('month', String(selectedPeriodValue))
      : supervisorQuery.eq('week', selectedWeek)

    const supervisorsPromise = isAgent
      ? Promise.resolve({ data: [], error: null })
      : supervisorQuery

    const [statsResult, periodsResult, supervisorsResult] = await Promise.all([
      query,
      supabaseAdmin.rpc('get_stats_period_values', {
        p_period_type: periodType,
        p_agent_name: isAgent ? resolvedAgentName || userName : null,
      }),
      supervisorsPromise,
    ])
    const { data: rawStats, error: statsError, count: statsCount } = statsResult

    if (statsError) {
      console.error('Stats fetch error:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    if (periodsResult.error) {
      // Keep the selected-period response usable if the optional period list
      // query fails. The page will fall back to its calendar-based options.
      console.error('Stats period fetch error:', periodsResult.error)
    }

    const availablePeriods = ((periodsResult.data || []) as Array<{ period_value?: unknown }>)
      .map((period) => Number(period.period_value))
      .filter((period) => Number.isInteger(period) && period > 0)

    // The generated schema does not yet include stats_month, so the dynamic
    // table query cannot infer this shared projection even though both tables
    // expose the same report columns.
    const statsForWeek = (rawStats || []) as unknown as StatsRow[]

    // Filter by agent name for agent users using fuzzy matching
    const agentStats = isAgent
      ? statsForWeek.filter(stat => getFuzzyNameScore(stat.name, userName) >= FUZZY_NAME_MATCH_THRESHOLD)
      : statsForWeek

    const stats = agentStats

    // If team leader/supervisor, also return list of unique supervisors for filtering
    let supervisors: string[] = []
    if (!isAgent) {
      const uniqueSupervisors = Array.from(
        new Set(
          ((supervisorsResult.data || []) as Array<{ supervisor?: string | null }>)
            .map((stat) => stat.supervisor)
            .filter((supervisor): supervisor is string => Boolean(supervisor))
        )
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
      availablePeriods,
      total: statsCount || 0,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
