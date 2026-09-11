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
import {
  averageStatsSummary,
  STATS_SUMMARY_FIELDS,
  type StatsSummaryRow,
} from '@/lib/statsSummary'
import { getHistoricalStatsTeamLeader } from '@/lib/statsHistory'
import {
  getStatsNamesForRosterTeam,
  getStatsRosterTeamLeaders,
  type StatsRosterEntry,
} from '@/lib/statsRoster'
import type { Database } from '@/types/database'

const MAX_PAGE_SIZE = 50
const SUMMARY_BATCH_SIZE = 1000
const NO_STATS_NAME_MATCH = '__mpg_no_stats_name_match__'
type StatsRow = Database['public']['Tables']['stats']['Row']

const fetchStatsSummaryRows = async ({
  isMonthly,
  periodValue,
  selectedRange,
  supervisor,
  agentNames,
}: {
  isMonthly: boolean
  periodValue: number
  selectedRange: number
  supervisor: string | null
  agentNames?: string[] | null
}) => {
  const rows: Partial<StatsSummaryRow>[] = []
  let offset = 0

  while (true) {
    let summaryQuery = supabaseAdmin
      .from(isMonthly ? 'stats_month' : 'stats')
      .select(STATS_SUMMARY_FIELDS.join(', '))

    summaryQuery = isMonthly
      ? summaryQuery.eq('month', String(periodValue))
      : summaryQuery.eq('week', periodValue).eq('range', selectedRange)

    if (agentNames) {
      summaryQuery = agentNames.length > 0
        ? summaryQuery.in('name', agentNames)
        : summaryQuery.eq('name', NO_STATS_NAME_MATCH)
    } else if (supervisor && supervisor !== 'all') {
      summaryQuery = summaryQuery.eq('supervisor', supervisor)
    }

    const { data, error } = await summaryQuery.range(offset, offset + SUMMARY_BATCH_SIZE - 1)
    if (error) throw error

    const batch = (data || []) as unknown as Partial<StatsSummaryRow>[]
    rows.push(...batch)

    if (batch.length < SUMMARY_BATCH_SIZE) break
    offset += SUMMARY_BATCH_SIZE
  }

  return rows
}

const fetchStatsNamesForPeriod = async ({
  isMonthly,
  periodValue,
}: {
  isMonthly: boolean
  periodValue: number
}) => {
  const names: string[] = []
  let offset = 0

  while (true) {
    let namesQuery = supabaseAdmin
      .from(isMonthly ? 'stats_month' : 'stats')
      .select('name')

    namesQuery = isMonthly
      ? namesQuery.eq('month', String(periodValue))
      : namesQuery.eq('week', periodValue)

    const { data, error } = await namesQuery.range(offset, offset + SUMMARY_BATCH_SIZE - 1)
    if (error) throw error

    const batch = (data || []) as Array<{ name?: string | null }>
    names.push(...batch
      .map(row => row.name?.trim())
      .filter((name): name is string => Boolean(name)))

    if (batch.length < SUMMARY_BATCH_SIZE) break
    offset += SUMMARY_BATCH_SIZE
  }

  return Array.from(new Set(names))
}

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

type AgentRosterIdentity = {
  name: string
  teamLeader: string | null
}

type AgentRosterRow = StatsRosterEntry & { email: string | null }

const getAgentRosterIdentity = (
  email: string,
  roster: AgentRosterRow[]
): AgentRosterIdentity | null => {
  const normalizedEmail = email.trim().toLowerCase()
  const rosterAgent = roster.find(agent => agent.email?.trim().toLowerCase() === normalizedEmail)
  const name = rosterAgent?.name?.trim()

  return name
    ? {
        name,
        teamLeader: rosterAgent?.team_leader?.trim() || null,
      }
    : null
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
    const searchQuery = searchParams.get('search')?.trim().toLowerCase() || ''
    const searchTerm = searchQuery.replace(/[(),]/g, ' ').trim()
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
    const { data: rosterData, error: rosterError } = await supabaseAdmin
      .from('agents')
      .select('name, email, team_leader')

    if (rosterError) {
      console.error('Agent roster fetch error:', rosterError)
      return NextResponse.json({ error: 'Failed to fetch the agent roster' }, { status: 500 })
    }

    const roster = ((rosterData || []) as AgentRosterRow[])
      .map(agent => ({
        name: agent.name?.trim() || '',
        email: agent.email,
        team_leader: agent.team_leader?.trim() || null,
      }))
      .filter(agent => Boolean(agent.name))
    const statsRoster: StatsRosterEntry[] = roster.map(agent => ({
      name: agent.name,
      team_leader: agent.team_leader,
    }))
    const supervisors = isAgent ? [] : getStatsRosterTeamLeaders(statsRoster)
    const selectedRosterTeamLeader = !isAgent
      && supervisorFilter
      && supervisorFilter !== 'all'
      ? supervisorFilter
      : null
    const agentRosterIdentity = isAgent ? getAgentRosterIdentity(dbUser.email, roster) : null
    const canonicalAgentName = agentRosterIdentity?.name || null
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
    const historicalAgentIdentity = isAgent && !agentRosterIdentity?.teamLeader
      ? await getHistoricalStatsTeamLeader([resolvedAgentName, ...agentIdentityNames])
      : null
    const agentTeamLeader = agentRosterIdentity?.teamLeader
      || historicalAgentIdentity?.teamLeader
      || null
    const rosterTeamLeaderFilter = selectedRosterTeamLeader
      || (isAgent && agentRosterIdentity?.teamLeader ? agentRosterIdentity.teamLeader : null)
    const rosterTeamStatsNames = rosterTeamLeaderFilter
      ? getStatsNamesForRosterTeam(
          await fetchStatsNamesForPeriod({
            isMonthly,
            periodValue: selectedPeriodValue,
          }),
          statsRoster,
          rosterTeamLeaderFilter
        )
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
    } else if (selectedRosterTeamLeader) {
      query = rosterTeamStatsNames && rosterTeamStatsNames.length > 0
        ? query.in('name', rosterTeamStatsNames)
        : query.eq('name', NO_STATS_NAME_MATCH)
    }
    if (searchQuery) {
      query = query.ilike('name', `%${searchTerm}%`)
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
      } else if (selectedRosterTeamLeader) {
        rangeQuery = rosterTeamStatsNames && rosterTeamStatsNames.length > 0
          ? rangeQuery.in('name', rosterTeamStatsNames)
          : rangeQuery.eq('name', NO_STATS_NAME_MATCH)
      }
      if (searchQuery) {
        rangeQuery = rangeQuery.ilike('name', `%${searchTerm}%`)
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

    const [statsResult, periodResults] = await Promise.all([
      query,
      periodsPromise,
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

    let summary: StatsSummaryRow | null = null
    let summaryMode: 'average' | 'single' | 'none' = 'none'
    let summaryRowCount = 0
    let agentTeamSummary: StatsSummaryRow | null = null
    let agentTeamSummaryRowCount = 0

    if (isAgent && agentTeamLeader) {
      // Agents receive aggregate metrics only. Team membership is identified by
      // the current roster when available, otherwise by the newest historical
      // Stats snapshot for agents who are no longer in the roster.
      const teamSummaryRows = await fetchStatsSummaryRows({
        isMonthly,
        periodValue: selectedPeriodValue,
        selectedRange,
        supervisor: rosterTeamStatsNames ? null : agentTeamLeader,
        agentNames: rosterTeamStatsNames,
      })
      agentTeamSummary = averageStatsSummary(teamSummaryRows)
      agentTeamSummaryRowCount = teamSummaryRows.length
    } else if (!isAgent) {
      if (searchQuery) {
        if (statsCount === 1 && stats.length === 1) {
          summary = Object.fromEntries(
            STATS_SUMMARY_FIELDS.map(field => [field, stats[0][field]])
          ) as StatsSummaryRow
          summaryMode = 'single'
          summaryRowCount = 1
        }
      } else {
        const summaryRows = await fetchStatsSummaryRows({
          isMonthly,
          periodValue: selectedPeriodValue,
          selectedRange,
          supervisor: null,
          agentNames: selectedRosterTeamLeader ? rosterTeamStatsNames : null,
        })
        summary = averageStatsSummary(summaryRows)
        summaryMode = summary ? 'average' : 'none'
        summaryRowCount = summaryRows.length
      }
    }

    return NextResponse.json({
      stats,
      summary,
      summaryMode,
      summaryRowCount,
      agentTeamSummary,
      agentTeamSummaryRowCount,
      agentTeamLeader: isAgent ? agentTeamLeader : null,
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
