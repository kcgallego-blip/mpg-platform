import {
  calculateAgentMetrics,
  calculateTicketsPerHour,
  formatDurationMinutes,
} from './tphProductivity.ts'

export const PRODUCTIVITY_REPORT_ROLES = [
  'Admin',
  'Supervisor',
  'Operations Manager',
  'Team Leader',
] as const

export const PRODUCTIVITY_SHIFT_HOURS = Array.from({ length: 18 }, (_, index) => {
  const hour = (18 + index) % 24
  return String(hour).padStart(2, '0')
})

export type ProductivityTicketRow = {
  ticket_num: number
  agent: string | null
  status: string | null
  created_at: string
  shift_date?: string | null
}

export type DowntimeWindow = {
  start: string
  end: string
  hours: number
}

export type ProductivityAgentReport = {
  email: string
  name: string
  totalTickets: number
  statusCounts: Record<string, number>
  hourlyCounts: Record<string, number>
  solvedTickets: number
  pendingTickets: number
  resolutionRate: number
  firstTicketAt: string
  lastTicketAt: string
  activeDurationMinutes: number
  activeDuration: string
  tph: number
  downtime: DowntimeWindow[]
  tier: PerformanceTier
}

export type PerformanceTier = 'High' | 'Meeting Expectations' | 'Underperforming'

export type HourlyVolume = {
  hour: string
  tickets: number
}

export type ProductivityReport = {
  shiftDate: string
  generatedAt: string
  scopeLabel: string
  team: {
    agents: number
    totalTickets: number
    statusCounts: Record<string, number>
    activeDurationMinutes: number
    activeDuration: string
    averageTph: number
  }
  agents: ProductivityAgentReport[]
  performers: {
    topByVolume: ProductivityAgentReport[]
    bottomByVolume: ProductivityAgentReport[]
    topByTph: ProductivityAgentReport[]
    bottomByTph: ProductivityAgentReport[]
    resolutionLeaders: ProductivityAgentReport[]
  }
  downtime: Array<{
    email: string
    name: string
    windows: DowntimeWindow[]
  }>
  hourlyVolume: HourlyVolume[]
  peakHours: HourlyVolume[]
  offPeakHours: HourlyVolume[]
  tiers: Record<PerformanceTier, ProductivityAgentReport[]>
  tierThresholds: {
    highTph: number
    meetingTph: number
  }
}

const HOUR_MS = 60 * 60 * 1000

const getFallbackName = (email: string) => {
  const localPart = email.split('@')[0] || email
  return (
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ') || email
  )
}

const normalizeStatus = (status: string | null) => {
  const normalized = (status || '').trim().toLowerCase().replace(/[_\s]+/g, '-')

  if (normalized === 'open') return 'Open'
  if (normalized === 'solved' || normalized === 'resolved' || normalized === 'closed') return 'Solved'
  if (normalized === 'pending') return 'Pending'
  if (normalized === 'on-hold' || normalized === 'onhold') return 'On-Hold'
  if (!normalized) return 'No Status'

  return (status || 'No Status').trim()
}

const getManilaHour = (timestamp: string) => {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(timestamp))
    .find((part) => part.type === 'hour')?.value

  return String(Number(hour || 0)).padStart(2, '0')
}

const roundOne = (value: number) => Math.round(value * 10) / 10

const findDowntime = (timestamps: number[]): DowntimeWindow[] => {
  if (timestamps.length < 2) return []

  const ordered = [...timestamps].sort((first, second) => first - second)
  const firstHour = Math.floor(ordered[0] / HOUR_MS)
  const lastHour = Math.floor(ordered[ordered.length - 1] / HOUR_MS)
  const occupiedHours = new Set(ordered.map((timestamp) => Math.floor(timestamp / HOUR_MS)))
  const windows: DowntimeWindow[] = []
  let zeroStart: number | null = null

  const closeWindow = (exclusiveEndHour: number) => {
    if (zeroStart === null) return

    const hours = exclusiveEndHour - zeroStart
    if (hours >= 2) {
      windows.push({
        start: new Date(zeroStart * HOUR_MS).toISOString(),
        end: new Date(exclusiveEndHour * HOUR_MS).toISOString(),
        hours,
      })
    }
    zeroStart = null
  }

  // The boundary hours necessarily contain the first and last ticket. Scanning
  // the inclusive range makes the active-window constraint explicit and keeps
  // gaps before the first or after the last ticket out of the report.
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    if (!occupiedHours.has(hour)) {
      zeroStart ??= hour
    } else {
      closeWindow(hour)
    }
  }
  closeWindow(lastHour + 1)

  return windows
}

const byName = (first: ProductivityAgentReport, second: ProductivityAgentReport) =>
  first.name.localeCompare(second.name)

const takeRanked = (
  agents: ProductivityAgentReport[],
  compare: (first: ProductivityAgentReport, second: ProductivityAgentReport) => number
) => [...agents].sort((first, second) => compare(first, second) || byName(first, second)).slice(0, 3)

export const aggregateProductivityReport = ({
  shiftDate,
  tickets,
  namesByEmail,
  scopeLabel,
  generatedAt = new Date().toISOString(),
}: {
  shiftDate: string
  tickets: ProductivityTicketRow[]
  namesByEmail: ReadonlyMap<string, string>
  scopeLabel: string
  generatedAt?: string
}): ProductivityReport => {
  const ticketsByAgent = new Map<string, ProductivityTicketRow[]>()

  tickets.forEach((ticket) => {
    const email = ticket.agent?.trim()
    if (!email || !Number.isFinite(Date.parse(ticket.created_at))) return
    ticketsByAgent.set(email, [...(ticketsByAgent.get(email) || []), ticket])
  })

  const baseAgents = Array.from(ticketsByAgent.entries()).map(([email, agentTickets]) => {
    const orderedTickets = [...agentTickets].sort(
      (first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)
    )
    const statusCounts: Record<string, number> = {}
    const hourlyCounts = Object.fromEntries(
      PRODUCTIVITY_SHIFT_HOURS.map((hour) => [hour, 0])
    ) as Record<string, number>

    orderedTickets.forEach((ticket) => {
      const status = normalizeStatus(ticket.status)
      const hour = getManilaHour(ticket.created_at)
      statusCounts[status] = (statusCounts[status] || 0) + 1
      hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1
    })

    const metrics = calculateAgentMetrics(orderedTickets)
    const solvedTickets = statusCounts.Solved || 0
    const pendingTickets = statusCounts.Pending || 0
    const resolutionBase = solvedTickets + pendingTickets
    const timestamps = orderedTickets.map((ticket) => Date.parse(ticket.created_at))

    return {
      email,
      name: namesByEmail.get(email) || getFallbackName(email),
      totalTickets: orderedTickets.length,
      statusCounts,
      hourlyCounts,
      solvedTickets,
      pendingTickets,
      resolutionRate: resolutionBase > 0 ? roundOne((solvedTickets / resolutionBase) * 100) : 0,
      firstTicketAt: orderedTickets[0].created_at,
      lastTicketAt: orderedTickets[orderedTickets.length - 1].created_at,
      activeDurationMinutes: metrics.netDurationMinutes,
      activeDuration: metrics.formattedNetDuration,
      tph: metrics.tph,
      downtime: findDowntime(timestamps),
      tier: 'Meeting Expectations' as PerformanceTier,
    }
  })

  const totalTickets = baseAgents.reduce((total, agent) => total + agent.totalTickets, 0)
  const activeDurationMinutes = baseAgents.reduce(
    (total, agent) => total + agent.activeDurationMinutes,
    0
  )
  const averageTph = calculateTicketsPerHour(totalTickets, activeDurationMinutes)
  const highTph = roundOne(averageTph * 1.2)
  const meetingTph = roundOne(averageTph * 0.8)

  const agents = baseAgents
    .map((agent) => ({
      ...agent,
      tier: (
        agent.tph >= highTph
          ? 'High'
          : agent.tph >= meetingTph
            ? 'Meeting Expectations'
            : 'Underperforming'
      ) as PerformanceTier,
    }))
    .sort(byName)

  const statusCounts = agents.reduce<Record<string, number>>((totals, agent) => {
    Object.entries(agent.statusCounts).forEach(([status, count]) => {
      totals[status] = (totals[status] || 0) + count
    })
    return totals
  }, {})

  const hourlyVolume = PRODUCTIVITY_SHIFT_HOURS.map((hour) => ({
    hour,
    tickets: agents.reduce((total, agent) => total + (agent.hourlyCounts[hour] || 0), 0),
  }))

  const tiers: ProductivityReport['tiers'] = {
    High: [],
    'Meeting Expectations': [],
    Underperforming: [],
  }
  agents.forEach((agent) => tiers[agent.tier].push(agent))

  return {
    shiftDate,
    generatedAt,
    scopeLabel,
    team: {
      agents: agents.length,
      totalTickets,
      statusCounts,
      activeDurationMinutes,
      activeDuration: formatDurationMinutes(activeDurationMinutes),
      averageTph,
    },
    agents,
    performers: {
      topByVolume: takeRanked(agents, (first, second) => second.totalTickets - first.totalTickets),
      bottomByVolume: takeRanked(agents, (first, second) => first.totalTickets - second.totalTickets),
      topByTph: takeRanked(agents, (first, second) => second.tph - first.tph),
      bottomByTph: takeRanked(agents, (first, second) => first.tph - second.tph),
      resolutionLeaders: takeRanked(
        agents,
        (first, second) =>
          second.solvedTickets - first.solvedTickets ||
          second.resolutionRate - first.resolutionRate
      ),
    },
    downtime: agents
      .filter((agent) => agent.downtime.length > 0)
      .map((agent) => ({ email: agent.email, name: agent.name, windows: agent.downtime })),
    hourlyVolume,
    peakHours: [...hourlyVolume]
      .sort((first, second) => second.tickets - first.tickets || first.hour.localeCompare(second.hour))
      .slice(0, 3),
    offPeakHours: [...hourlyVolume]
      .sort((first, second) => first.tickets - second.tickets || first.hour.localeCompare(second.hour))
      .slice(0, 3),
    tiers,
    tierThresholds: { highTph, meetingTph },
  }
}
