import 'server-only'

import type {
  AgentInsightData,
  AgentInsightProductivityDay,
  AgentInsightRosterOption,
  AgentInsightStatSnapshot,
  AgentInsightSurvey,
} from './agentInsight'
import {
  collapseAgentInsightMonths,
  collapseAgentInsightWeeks,
  getCurrentManilaShiftDate,
  getDateKeysEndingAt,
  getManilaCalendarParts,
  isSnapshotInCurrentManilaWeek,
  summarizeHistoricalProductivity,
  toDateKey,
} from './agentInsight'
import { sanitizeSurveyComment } from './homeInsights'
import {
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  resolveStatsNameFromCandidates,
} from './statsIdentity'
import { calculateMetricsFromRawDuration } from './tphProductivity'
import { supabaseAdmin } from './supabaseAdmin'

const STATS_PROJECTION = [
  'id', 'name', 'supervisor', 'acw', 'aht', 'hold', 'talk_time', 'csat_score',
  'dsat', 'nps_score', 'promoter', 'mod', 'mod_value', 'fcr', 'fcr_value',
  'surveys_answered', 'calls_touched', 'tickets_solved', 'transactions',
  'productive_hours', 'tph', 'created_at',
].join(', ')
const NAME_CANDIDATE_LIMIT = 100

type RosterRow = {
  name: string
  email: string | null
  team_leader: string | null
  role: string | null
}

type SurveyRow = {
  survey_date: string | null
  response_id: string
  agent: string
  csat: 'Unsatisfied' | 'Neutral' | 'Satisfied'
  mod_comment: string | null
  open_comment: string | null
  created_at: string
}

type ProductivitySummaryRow = {
  shift_date: string
  agent: string
  tickets: string | null
  hourly_tickets: string | null
  created_at: string
}

type ProductivityBucketRow = {
  agent: string
  ticket_status: string
  hour_key: string
  ticket_count: number
  first_ticket_time: string
  latest_ticket_time: string
}

export class AgentInsightNotFoundError extends Error {
  constructor() {
    super('The selected agent is not in the current roster')
    this.name = 'AgentInsightNotFoundError'
  }
}

const toRosterOption = (row: RosterRow): AgentInsightRosterOption => ({
  name: row.name.trim(),
  email: row.email?.trim() || null,
  teamLeader: row.team_leader?.trim() || null,
  role: row.role?.trim() || null,
})

export async function getAgentInsightRoster() {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('name, email, team_leader, role')
    .order('name', { ascending: true })

  if (error) throw error
  return ((data || []) as RosterRow[])
    .filter((row) => Boolean(row.name?.trim()))
    .map(toRosterOption)
}

async function getRosterAgent(agentName: string) {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('name, email, team_leader, role')
    .eq('name', agentName)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new AgentInsightNotFoundError()
  return toRosterOption(data as RosterRow)
}

async function resolveName(
  tables: string[],
  column: 'name' | 'agent',
  identityNames: string[]
) {
  const identities = getUniqueStatsIdentityNames(identityNames)
  const candidates = new Set<string>()

  for (const identity of identities) {
    const exactResults = await Promise.all(tables.map((table) =>
      supabaseAdmin.from(table).select(column).ilike(column, identity).limit(5)
    ))
    const exactFailure = exactResults.find((result) => result.error)
    if (exactFailure?.error) throw exactFailure.error

    exactResults.forEach((result) => {
      ;((result.data || []) as unknown as Array<Record<string, unknown>>).forEach((row) => {
        const value = typeof row[column] === 'string' ? row[column].trim() : ''
        if (value) candidates.add(value)
      })
    })

    const exactMatch = resolveStatsNameFromCandidates(Array.from(candidates), [identity])
    if (exactMatch) return exactMatch

    const fuzzyResults = await Promise.all(
      tables.flatMap((table) => getStatsNameSearchFragments(identity).map((fragment) =>
        supabaseAdmin
          .from(table)
          .select(column)
          .ilike(column, `%${fragment}%`)
          .limit(NAME_CANDIDATE_LIMIT)
      ))
    )
    const fuzzyFailure = fuzzyResults.find((result) => result.error)
    if (fuzzyFailure?.error) throw fuzzyFailure.error

    fuzzyResults.forEach((result) => {
      ;((result.data || []) as unknown as Array<Record<string, unknown>>).forEach((row) => {
        const value = typeof row[column] === 'string' ? row[column].trim() : ''
        if (value) candidates.add(value)
      })
    })

    const fuzzyMatch = resolveStatsNameFromCandidates(Array.from(candidates), [identity])
    if (fuzzyMatch) return fuzzyMatch
  }

  return null
}

async function getStats(agent: AgentInsightRosterOption, warnings: string[]) {
  const weeklyName = await resolveName(['stats'], 'name', [agent.name])
  let monthlyName: string | null = null
  let monthlyLookupFailed = false
  try {
    monthlyName = await resolveName(['stats_month'], 'name', [agent.name])
  } catch {
    monthlyLookupFailed = true
    warnings.push('Monthly Stats are temporarily unavailable.')
  }

  if (!weeklyName) warnings.push('No weekly Stats identity could be matched for this roster agent.')
  if (!monthlyName && !monthlyLookupFailed) warnings.push('No monthly Stats identity could be matched for this roster agent.')

  const weeklyResult = weeklyName
    ? await supabaseAdmin
        .from('stats')
        .select(`${STATS_PROJECTION}, week, range`)
        .eq('name', weeklyName)
        .order('created_at', { ascending: false })
        .limit(120)
    : { data: [], error: null }
  const monthlyResult = monthlyName && !monthlyLookupFailed
    ? await supabaseAdmin
        .from('stats_month')
        .select(`${STATS_PROJECTION}, month`)
        .eq('name', monthlyName)
        .order('created_at', { ascending: false })
        .limit(36)
    : { data: [], error: null }

  if (weeklyResult.error) throw weeklyResult.error
  if (monthlyResult.error) {
    if (!warnings.includes('Monthly Stats are temporarily unavailable.')) {
      warnings.push('Monthly Stats are temporarily unavailable.')
    }
  }

  const trend = collapseAgentInsightWeeks(
    (weeklyResult.data || []) as unknown as AgentInsightStatSnapshot[],
    4
  )
  const current = trend[0] || null
  const monthlySnapshots = monthlyResult.error
    ? []
    : collapseAgentInsightMonths(
        (monthlyResult.data || []) as unknown as AgentInsightStatSnapshot[],
        2
      )

  if (!current) warnings.push('No weekly Stats snapshots are available for this agent.')
  if (monthlyName && !monthlyLookupFailed && !monthlyResult.error && monthlySnapshots.length === 0) {
    warnings.push('No monthly Stats snapshots are available for this agent.')
  }
  if (current && !isSnapshotInCurrentManilaWeek(current)) {
    warnings.push(`The newest weekly Stats snapshot is from Week ${current.week}; current-week data has not been uploaded.`)
  }

  return {
    current,
    previousWeek: trend[1] || null,
    monthly: monthlySnapshots[0] || null,
    previousMonth: monthlySnapshots[1] || null,
    trend,
    isCurrentWeek: isSnapshotInCurrentManilaWeek(current),
  }
}

async function getSurveys(agent: AgentInsightRosterOption, warnings: string[]) {
  const surveyName = await resolveName(['survey'], 'agent', [agent.name])
  if (!surveyName) {
    warnings.push('No Survey identity could be matched for this roster agent.')
    return []
  }

  const manila = getManilaCalendarParts()
  const cutoff = new Date(manila.year, manila.month - 1, manila.day)
  cutoff.setDate(cutoff.getDate() - 42)

  const { data, error } = await supabaseAdmin
    .from('survey')
    .select('survey_date, response_id, agent, csat, mod_comment, open_comment, created_at')
    .eq('agent', surveyName)
    .in('csat', ['Neutral', 'Unsatisfied'])
    .gte('survey_date', toDateKey(cutoff))
    .order('survey_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error

  return ((data || []) as SurveyRow[])
    .map<AgentInsightSurvey>((row) => ({
      surveyDate: row.survey_date,
      responseId: row.response_id,
      sentiment: row.csat as 'Unsatisfied' | 'Neutral',
      modComment: sanitizeSurveyComment(row.mod_comment) || null,
      openComment: sanitizeSurveyComment(row.open_comment) || null,
    }))
    .filter((row) => Boolean(row.modComment || row.openComment))
    .slice(0, 12)
}

const mergeCounts = (target: Record<string, number>, source: Record<string, number>) => {
  Object.entries(source).forEach(([status, count]) => {
    target[status] = (target[status] || 0) + count
  })
}

async function getProductivity(agent: AgentInsightRosterOption, warnings: string[]) {
  const currentShiftDate = getCurrentManilaShiftDate()
  const dateKeys = getDateKeysEndingAt(currentShiftDate, 14)
  if (!agent.email) {
    warnings.push('The roster has no email for this agent, so productivity cannot be matched.')
    return {
      days: [] as AgentInsightProductivityDay[],
      statusTotals: {},
      currentShiftDate,
    }
  }

  const [historicalResult, liveResult] = await Promise.all([
    supabaseAdmin
      .from('tph_summary')
      .select('shift_date, agent, tickets, hourly_tickets, created_at')
      .ilike('agent', agent.email)
      .gte('shift_date', dateKeys[0])
      .lte('shift_date', currentShiftDate)
      .order('created_at', { ascending: false }),
    supabaseAdmin.rpc('get_tph_productivity_buckets', {
      p_shift_date: currentShiftDate,
      p_status: 'All',
      p_agent: agent.email,
      p_team_leader: null,
    }),
  ])

  if (historicalResult.error) throw historicalResult.error
  if (liveResult.error) {
    warnings.push('Current-shift productivity is temporarily unavailable; historical summaries are still shown.')
  }

  const historicalByDate = new Map<string, ReturnType<typeof summarizeHistoricalProductivity>>()
  ;((historicalResult.data || []) as ProductivitySummaryRow[]).forEach((row) => {
    if (!historicalByDate.has(row.shift_date)) {
      historicalByDate.set(row.shift_date, summarizeHistoricalProductivity(row))
    }
  })

  const liveBuckets = liveResult.error
    ? []
    : (liveResult.data || []) as ProductivityBucketRow[]
  let liveDay: Omit<AgentInsightProductivityDay, 'isCurrentShift'> | null = null

  if (liveBuckets.length > 0) {
    const statusCounts: Record<string, number> = {}
    let firstTime = Number.POSITIVE_INFINITY
    let latestTime = Number.NEGATIVE_INFINITY
    let tickets = 0

    liveBuckets.forEach((bucket) => {
      const count = Number(bucket.ticket_count) || 0
      tickets += count
      statusCounts[bucket.ticket_status] = (statusCounts[bucket.ticket_status] || 0) + count
      const first = Date.parse(bucket.first_ticket_time)
      const latest = Date.parse(bucket.latest_ticket_time)
      if (Number.isFinite(first)) firstTime = Math.min(firstTime, first)
      if (Number.isFinite(latest)) latestTime = Math.max(latestTime, latest)
    })

    const durationMinutes = Number.isFinite(firstTime) && Number.isFinite(latestTime)
      ? Math.max(0, (latestTime - firstTime) / 60_000)
      : 0
    liveDay = {
      shiftDate: currentShiftDate,
      tickets,
      tph: calculateMetricsFromRawDuration(tickets, durationMinutes).tph,
      statusCounts,
    }
  }

  const statusTotals: Record<string, number> = {}
  const days = dateKeys.map<AgentInsightProductivityDay>((shiftDate) => {
    const source = shiftDate === currentShiftDate && liveDay
      ? liveDay
      : historicalByDate.get(shiftDate)
    const day = source
      ? {
          shiftDate,
          tickets: source.tickets,
          tph: source.tph,
          statusCounts: source.statusCounts,
          isCurrentShift: shiftDate === currentShiftDate,
        }
      : {
          shiftDate,
          tickets: null,
          tph: null,
          statusCounts: {},
          isCurrentShift: shiftDate === currentShiftDate,
        }
    mergeCounts(statusTotals, day.statusCounts)
    return day
  }).filter((day) => day.tickets !== null)

  return { days, statusTotals, currentShiftDate }
}

export async function getAgentInsightData(agentName: string): Promise<AgentInsightData> {
  const agent = await getRosterAgent(agentName)
  const warnings: string[] = []

  const [statsResult, surveyResult, productivityResult] = await Promise.allSettled([
    getStats(agent, warnings),
    getSurveys(agent, warnings),
    getProductivity(agent, warnings),
  ])

  const stats = statsResult.status === 'fulfilled'
    ? statsResult.value
    : (() => {
        warnings.push('Stats are temporarily unavailable for this agent.')
        return { current: null, previousWeek: null, monthly: null, previousMonth: null, trend: [], isCurrentWeek: false }
      })()
  const surveys = surveyResult.status === 'fulfilled'
    ? surveyResult.value
    : (() => {
        warnings.push('Survey feedback is temporarily unavailable for this agent.')
        return []
      })()
  const productivity = productivityResult.status === 'fulfilled'
    ? productivityResult.value
    : (() => {
        warnings.push('Productivity is temporarily unavailable for this agent.')
        const currentShiftDate = getCurrentManilaShiftDate()
        return {
          days: [] as AgentInsightProductivityDay[],
          statusTotals: {},
          currentShiftDate,
        }
      })()

  return {
    agent,
    stats,
    surveys,
    productivity,
    warnings: Array.from(new Set(warnings)),
  }
}
