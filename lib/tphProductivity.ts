export const TPH_STATUS_COLUMNS = ['Open', 'Pending', 'On-Hold', 'Solved'] as const
export const TPH_STATUS_DISPLAY_COLUMNS = ['Open', 'Pending', 'On-Hold', 'Solved'] as const

export type TphStatus = (typeof TPH_STATUS_COLUMNS)[number]
export type TicketStatusCounts = Record<string, number>
export type HourlyTicketCounts = Record<string, number>
export type TphDataSource = 'tph' | 'tph_summary'

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
