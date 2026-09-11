import {
  calculateMetricsFromRawDuration,
  getTotalTicketCount,
  parseHourlyTickets,
  parseSummaryTickets,
} from './tphProductivity.ts'

export const AGENT_INSIGHT_KEY_METRICS = [
  'csat_score',
  'acw',
  'aht',
  'surveys_answered',
  'tph',
] as const

export const AGENT_INSIGHT_TREND_METRICS = ['csat_score', 'acw', 'aht', 'tph'] as const

export type AgentInsightMetric = (typeof AGENT_INSIGHT_KEY_METRICS)[number]
export type AgentInsightTrendMetric = (typeof AGENT_INSIGHT_TREND_METRICS)[number]

export type AgentInsightRosterOption = {
  name: string
  email: string | null
  teamLeader: string | null
  role: string | null
}

export type AgentInsightStatSnapshot = {
  id?: string | null
  name: string
  supervisor: string | null
  acw: string | null
  aht: string | null
  hold: string | null
  talk_time: string | null
  csat_score: string | null
  dsat: string | null
  nps_score: number | null
  promoter: number | null
  mod: string | null
  mod_value: number | null
  fcr: string | null
  fcr_value: number | null
  surveys_answered: number | null
  calls_touched: number | null
  tickets_solved: number | null
  transactions: number | null
  productive_hours: string | null
  tph: number | null
  week?: number | null
  range?: number | null
  month?: number | string | null
  created_at: string
}

export type AgentInsightSurvey = {
  surveyDate: string | null
  responseId: string
  sentiment: 'Unsatisfied' | 'Neutral'
  modComment: string | null
  openComment: string | null
}

export type AgentInsightProductivityDay = {
  shiftDate: string
  tickets: number | null
  tph: number | null
  statusCounts: Record<string, number>
  isCurrentShift: boolean
}

export type AgentInsightData = {
  agent: AgentInsightRosterOption
  stats: {
    current: AgentInsightStatSnapshot | null
    previousWeek: AgentInsightStatSnapshot | null
    monthly: AgentInsightStatSnapshot | null
    previousMonth: AgentInsightStatSnapshot | null
    trend: AgentInsightStatSnapshot[]
    isCurrentWeek: boolean
  }
  surveys: AgentInsightSurvey[]
  productivity: {
    days: AgentInsightProductivityDay[]
    statusTotals: Record<string, number>
    currentShiftDate: string
  }
  warnings: string[]
}

export type AgentInsightEvidence = {
  title: string
  evidence: string
}

export type AgentInsightAiResult = {
  summary: string
  strengths: AgentInsightEvidence[]
  improvementPriorities: AgentInsightEvidence[]
  actionPlan: string[]
  generatedAt: string
}

type WeeklySnapshot = AgentInsightStatSnapshot & { week: number; range: number }
type MonthlySnapshot = AgentInsightStatSnapshot & { month: number }

const createdTime = (row: AgentInsightStatSnapshot) => {
  const value = Date.parse(row.created_at)
  return Number.isFinite(value) ? value : 0
}

const weeklyPeriodTime = (row: WeeklySnapshot) => {
  const created = new Date(row.created_at)
  if (!Number.isFinite(created.getTime())) return 0
  const yearStart = new Date(created.getFullYear(), 0, 1)
  yearStart.setDate(yearStart.getDate() - yearStart.getDay())
  yearStart.setDate(yearStart.getDate() + (row.week - 1) * 7)
  return yearStart.getTime()
}

/** Keep the most complete/latest upload for each year + week, newest first. */
export function collapseAgentInsightWeeks(rows: AgentInsightStatSnapshot[], limit = 4) {
  const snapshots = new Map<string, WeeklySnapshot>()

  rows.forEach((row) => {
    if (!Number.isInteger(row.week) || !Number.isInteger(row.range)) return
    const week = Number(row.week)
    const range = Number(row.range)
    const created = new Date(row.created_at)
    const year = Number.isFinite(created.getTime()) ? created.getFullYear() : 0
    const key = `${year}:${week}`
    const candidate = { ...row, week, range } as WeeklySnapshot
    const existing = snapshots.get(key)

    if (
      !existing ||
      candidate.range > existing.range ||
      (candidate.range === existing.range && createdTime(candidate) > createdTime(existing))
    ) {
      snapshots.set(key, candidate)
    }
  })

  return Array.from(snapshots.values())
    .sort((first, second) => weeklyPeriodTime(second) - weeklyPeriodTime(first))
    .slice(0, limit)
}

const monthlyPeriodYear = (row: MonthlySnapshot) => {
  const created = new Date(row.created_at)
  if (!Number.isFinite(created.getTime())) return 0
  const uploadMonth = created.getMonth() + 1
  return row.month - uploadMonth > 6 ? created.getFullYear() - 1 : created.getFullYear()
}

/** Keep the latest upload for each year + month, ordered by the represented month. */
export function collapseAgentInsightMonths(rows: AgentInsightStatSnapshot[], limit = 2) {
  const snapshots = new Map<string, MonthlySnapshot>()

  rows.forEach((row) => {
    const month = Number(row.month)
    if (!Number.isInteger(month) || month < 1 || month > 12) return
    const candidate = { ...row, month } as MonthlySnapshot
    const year = monthlyPeriodYear(candidate)
    const key = `${year}:${month}`
    const existing = snapshots.get(key)

    if (!existing || createdTime(candidate) > createdTime(existing)) {
      snapshots.set(key, candidate)
    }
  })

  return Array.from(snapshots.values())
    .sort((first, second) => {
      const firstPeriod = monthlyPeriodYear(first) * 12 + first.month
      const secondPeriod = monthlyPeriodYear(second) * 12 + second.month
      return secondPeriod - firstPeriod
    })
    .slice(0, limit)
}

export function getManilaCalendarParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)

  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getCurrentManilaShiftDate(date = new Date()) {
  const parts = getManilaCalendarParts(date)
  const shiftDate = new Date(parts.year, parts.month - 1, parts.day)
  if (parts.hour < 19) shiftDate.setDate(shiftDate.getDate() - 1)
  return toDateKey(shiftDate)
}

export function getDateKeysEndingAt(endDateKey: string, count: number) {
  const [year, month, day] = endDateKey.split('-').map(Number)
  const end = new Date(year, month - 1, day)
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(end)
    value.setDate(end.getDate() - (count - index - 1))
    return toDateKey(value)
  })
}

export function summarizeHistoricalProductivity(row: {
  shift_date: string
  tickets: string | null
  hourly_tickets: string | null
}) {
  const statusCounts = parseSummaryTickets(row.tickets)
  const hourlyCounts = parseHourlyTickets(row.hourly_tickets)
  const tickets = getTotalTicketCount(statusCounts)
  const activeHours = Object.values(hourlyCounts).filter((count) => count > 0).length
  const metrics = calculateMetricsFromRawDuration(tickets, activeHours * 60)

  return {
    shiftDate: row.shift_date,
    tickets,
    tph: metrics.tph,
    statusCounts,
  }
}

export function isSnapshotInCurrentManilaWeek(
  snapshot: AgentInsightStatSnapshot | null,
  now = new Date()
) {
  if (!snapshot?.week) return false
  const manila = getManilaCalendarParts(now)
  const date = new Date(manila.year, manila.month - 1, manila.day)
  const weekStart = new Date(date)
  weekStart.setDate(date.getDate() - date.getDay())
  const yearStart = new Date(date.getFullYear(), 0, 1)
  yearStart.setDate(yearStart.getDate() - yearStart.getDay())
  const currentWeek = Math.floor((weekStart.getTime() - yearStart.getTime()) / 604_800_000) + 1
  const snapshotDate = new Date(snapshot.created_at)
  return snapshot.week === currentWeek && snapshotDate.getFullYear() === date.getFullYear()
}
