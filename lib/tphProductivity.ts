export const TPH_STATUS_COLUMNS = ['Open', 'Pending', 'On-Hold', 'Solved'] as const
export const TPH_STATUS_DISPLAY_COLUMNS = ['Open', 'Pending', 'On-Hold', 'Solved'] as const

export type TphStatus = (typeof TPH_STATUS_COLUMNS)[number]
export type TicketStatusCounts = Record<string, number>
export type HourlyTicketCounts = Record<string, number>
export type TphDataSource = 'tph' | 'tph_summary'

export type AgentMetricTicket = {
  created_at?: string | null
  handled_at?: string | null
  snapshot_at?: string | null
  timestamp?: string | null
}

export type AgentMetrics = {
  rawDurationMinutes: number
  deductionMinutes: number
  netDurationMinutes: number
  formattedNetDuration: string
  tph: number
}

const MS_PER_MINUTE = 60 * 1000

export const getDeductionMinutes = (rawDurationMinutes: number) => {
  if (rawDurationMinutes < 120) return 0
  if (rawDurationMinutes < 240) return 15
  if (rawDurationMinutes < 360) return 75
  return 90
}

export const formatDurationMinutes = (durationMinutes: number) => {
  const totalMinutes = Math.max(0, Math.floor(durationMinutes))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

export const calculateTicketsPerHour = (ticketTotal: number, netDurationMinutes: number) => {
  if (ticketTotal <= 0 || netDurationMinutes <= 0) return 0

  return Math.round((ticketTotal / (netDurationMinutes / 60)) * 10) / 10
}

export const calculateMetricsFromRawDuration = (
  ticketTotal: number,
  rawDurationMinutes: number
): AgentMetrics => {
  const safeRawDurationMinutes = Math.max(0, rawDurationMinutes)
  const deductionMinutes = getDeductionMinutes(safeRawDurationMinutes)
  const netDurationMinutes = ticketTotal > 0
    ? Math.max(1, safeRawDurationMinutes - deductionMinutes)
    : 0

  return {
    rawDurationMinutes: safeRawDurationMinutes,
    deductionMinutes,
    netDurationMinutes,
    formattedNetDuration: formatDurationMinutes(netDurationMinutes),
    tph: calculateTicketsPerHour(ticketTotal, netDurationMinutes),
  }
}

const getTicketTimestampMs = (ticket: AgentMetricTicket) => {
  const timestamp = ticket.handled_at || ticket.snapshot_at || ticket.created_at || ticket.timestamp
  const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN

  return Number.isFinite(timestampMs) ? timestampMs : null
}

export const calculateAgentMetrics = (tickets: AgentMetricTicket[]): AgentMetrics => {
  const validTimestamps = tickets
    .map(getTicketTimestampMs)
    .filter((timestamp): timestamp is number => timestamp !== null)

  if (tickets.length === 0 || validTimestamps.length === 0) {
    return calculateMetricsFromRawDuration(0, 0)
  }

  const firstTimestamp = Math.min(...validTimestamps)
  const lastTimestamp = Math.max(...validTimestamps)
  const rawDurationMinutes = Math.max(0, (lastTimestamp - firstTimestamp) / MS_PER_MINUTE)

  return calculateMetricsFromRawDuration(tickets.length, rawDurationMinutes)
}

export const parseSummaryTickets = (value: string | null | undefined): TicketStatusCounts => {
  const counts: TicketStatusCounts = {}
  const parts = (value || '').split(',').map((part) => Number.parseInt(part.trim(), 10))

  TPH_STATUS_COLUMNS.forEach((status, index) => {
    counts[status] = Number.isFinite(parts[index]) ? parts[index] : 0
  })

  return counts
}

export const parseHourlyTickets = (value: string | null | undefined): HourlyTicketCounts => {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<HourlyTicketCounts>((counts, part) => {
      const [rawHour, rawCount] = part.split(':')
      const hourNumber = Number.parseInt((rawHour || '').trim(), 10)
      const count = Number.parseInt((rawCount || '').trim(), 10)

      if (!Number.isInteger(hourNumber) || hourNumber < 0 || hourNumber > 23 || !Number.isFinite(count)) {
        return counts
      }

      counts[String(hourNumber).padStart(2, '0')] = count
      return counts
    }, {})
}

export const getTotalTicketCount = (statusCounts: TicketStatusCounts) =>
  TPH_STATUS_COLUMNS.reduce((total, status) => total + (statusCounts[status] || 0), 0)

export const getStatusFilteredCounts = (
  statusCounts: TicketStatusCounts,
  selectedStatus: string
) => {
  if (selectedStatus === 'All') return statusCounts

  return TPH_STATUS_COLUMNS.reduce<TicketStatusCounts>((counts, status) => {
    counts[status] = status === selectedStatus ? statusCounts[status] || 0 : 0
    return counts
  }, {})
}

export const getTphDataSourceForShiftDate = (
  shiftDate: string,
  currentShiftDate: string
): TphDataSource => shiftDate >= currentShiftDate ? 'tph' : 'tph_summary'

export const normalizeNameForMatch = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
