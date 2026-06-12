import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const FUZZY_NAME_MATCH_THRESHOLD = 60

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
    const authCookie = request.cookies.get('webex_auth')

    if (!authCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let userData
    try {
      userData = JSON.parse(authCookie.value)
    } catch {
      return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
    }

    // Get user's role from database
    const { data: dbUser, error: roleError } = await supabase
      .from('users')
      .select('role, name')
      .eq('email', userData.email)
      .single()

    if (roleError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || userData.name

    // Get query parameters for filtering and searching
    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('search')?.toLowerCase() || ''
    const supervisorFilter = searchParams.get('supervisor')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    // Validate sort parameters
    const validSortFields = [
      'name',
      'supervisor',
      'acw',
      'aht',
      'hold',
      'talk_time',
      'csat_score',
      'nps_score',
      'mod',
      'fcr',
      'tph',
      'created_at',
    ]
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'name'
    const safeOrder = sortOrder.toLowerCase() === 'desc' ? false : true

    const isAgent = userRole.toLowerCase() === 'agent'
    const agentNameTokens = getNameTokens(userName)

    // Build the base query
    let query = supabase.from('stats').select('*')

    // Apply role-based filtering
    if (isAgent) {
      // Agents can only see stats rows that fuzzy-match their users.name value.
      if (agentNameTokens.length > 0) {
        const filters = agentNameTokens.map(token => `name.ilike.%${token}%`)
        query = query.or(filters.join(','))
      } else {
        query = query.eq('name', userName)
      }
    } else if (
      userRole.toLowerCase() === 'team leader' ||
      userRole.toLowerCase() === 'supervisor'
    ) {
      // Team leaders can see stats of agents under them
      query = query.eq('supervisor', dbUser.name || userData.name)
    }
    // Admin/Manager roles can see all stats (no additional filter)

    query = query.order(safeSortBy, { ascending: safeOrder }).order('created_at', { ascending: false })

    const { data: rawStats, error: statsError } = await query

    if (statsError) {
      console.error('Stats fetch error:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const stats = isAgent
      ? (rawStats || [])
          .filter(stat => getFuzzyNameScore(stat.name, userName) >= FUZZY_NAME_MATCH_THRESHOLD)
          .sort((a, b) => {
            const scoreDiff = getFuzzyNameScore(b.name, userName) - getFuzzyNameScore(a.name, userName)
            if (scoreDiff !== 0) return scoreDiff
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
      : rawStats || []

    // If team leader/supervisor, also return list of unique supervisors for filtering
    let supervisors: string[] = []
    if (userRole.toLowerCase() !== 'agent') {
      const { data: supervisorData } = await supabase
        .from('stats')
        .select('supervisor')
        .order('supervisor', { ascending: true })

      // Get unique supervisors and filter out nulls
      const uniqueSupervisors = Array.from(
        new Set(supervisorData?.map(s => s.supervisor).filter(s => s) || [])
      )
      supervisors = uniqueSupervisors
    }

    return NextResponse.json({
      stats: stats || [],
      supervisors,
      userRole,
      userName,
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
