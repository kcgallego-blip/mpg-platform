import { NextRequest, NextResponse } from 'next/server'
import { STATS_COLUMNS, STATS_MONTH_COLUMNS } from '@/lib/dbColumns'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  resolveStatsNameFromCandidates,
} from '@/lib/statsIdentity'
import { getStatsWeekNumber, getStatsWeekRange } from '@/lib/statsUtils'
import type { Database } from '@/types/database'

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

const resolveStatsAgentName = async ({
  isMonthly,
  periodValue,
  identityNames,
}: {
  isMonthly: boolean
  periodValue: number
  identityNames: string[]
}) => {
  for (const identityName of identityNames) {
    // Prefer the selected period, then resolve against historical rows so an
    // agent can be redirected from an empty current period to their latest one.
    for (const selectedPeriodOnly of [true, false]) {
      let exactQuery = supabaseAdmin
        .from(isMonthly ? 'stats_month' : 'stats')
        .select('name')
        .ilike('name', identityName)
        .limit(1)

      if (selectedPeriodOnly) {
        exactQuery = isMonthly
          ? exactQuery.eq('month', String(periodValue))
          : exactQuery.eq('week', periodValue)
      }

      const exactResult = await exactQuery
      if (exactResult.error) throw exactResult.error
      const exactName = exactResult.data?.[0]?.name?.trim()
      if (exactName) return exactName

      const candidateResults = await Promise.all(
        getStatsNameSearchFragments(identityName).map(fragment => {
          let candidateQuery = supabaseAdmin
            .from(isMonthly ? 'stats_month' : 'stats')
            .select('name')
            .ilike('name', `%${fragment}%`)
            .limit(50)

          if (selectedPeriodOnly) {
            candidateQuery = isMonthly
              ? candidateQuery.eq('month', String(periodValue))
              : candidateQuery.eq('week', periodValue)
          }

          return candidateQuery
        })
      )
      const failedResult = candidateResults.find(result => result.error)
      if (failedResult?.error) throw failedResult.error

      const candidates = Array.from(new Set(candidateResults.flatMap(result =>
        ((result.data || []) as Array<{ name?: string | null }>)
          .map(row => row.name?.trim())
          .filter((name): name is string => Boolean(name))
      )))
      const resolvedName = resolveStatsNameFromCandidates(candidates, [identityName])

      if (resolvedName) return resolvedName
    }
  }

  return null
}

const getCanonicalAgentName = async (email: string) => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('name')
    .ilike('email', email.trim())
    .limit(1)

  if (error) {
    console.error('Canonical agent lookup error:', error)
    return null
  }

  return data?.[0]?.name?.trim() || null
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
    const canonicalAgentName = isAgent ? await getCanonicalAgentName(dbUser.email) : null
    const agentIdentityNames = isAgent
      ? getUniqueStatsIdentityNames([userName, canonicalAgentName])
      : []
    const resolvedAgentName = isAgent && agentIdentityNames.length > 0
      ? await resolveStatsAgentName({
          isMonthly,
          periodValue: selectedPeriodValue,
          identityNames: agentIdentityNames,
        })
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

    const periodIdentityNames = isAgent
      ? getUniqueStatsIdentityNames([resolvedAgentName, ...agentIdentityNames])
      : []
    const periodsPromise = isAgent
      ? Promise.all(periodIdentityNames.map(agentName =>
          supabaseAdmin.rpc('get_stats_period_values', {
            p_period_type: periodType,
            p_agent_name: agentName,
          })
        ))
      : Promise.all([
          supabaseAdmin.rpc('get_stats_period_values', {
            p_period_type: periodType,
            p_agent_name: null,
          }),
        ])

    const [statsResult, periodResults, supervisorsResult] = await Promise.all([
      query,
      periodsPromise,
      supervisorsPromise,
    ])
    const { data: rawStats, error: statsError, count: statsCount } = statsResult

    if (statsError) {
      console.error('Stats fetch error:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const failedPeriodResult = periodResults.find(result => result.error)
    if (failedPeriodResult?.error) {
      // Keep the selected-period response usable if the optional period list
      // query fails. The page will fall back to its calendar-based options.
      console.error('Stats period fetch error:', failedPeriodResult.error)
    }

    const availablePeriods = Array.from(new Set(
      periodResults.flatMap(result =>
        ((result.data || []) as Array<{ period_value?: unknown }>)
          .map(period => Number(period.period_value))
          .filter(period => Number.isInteger(period) && period > 0)
      )
    )).sort((first, second) => second - first)

    // The generated schema does not yet include stats_month, so the dynamic
    // table query cannot infer this shared projection even though both tables
    // expose the same report columns.
    const statsForWeek = (rawStats || []) as unknown as StatsRow[]

    // Agent queries are already restricted to the single server-resolved name.
    // Rechecking only the profile display name here would discard rows resolved
    // through the canonical roster identity.
    const stats = statsForWeek

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
