export const STATS_SUMMARY_FIELDS = [
  'acw',
  'aht',
  'hold',
  'talk_time',
  'csat_score',
  'dsat',
  'nps_score',
  'promoter',
  'mod',
  'mod_value',
  'fcr',
  'fcr_value',
  'surveys_answered',
  'tph',
] as const

export type StatsSummaryField = (typeof STATS_SUMMARY_FIELDS)[number]
export type StatsSummaryValue = string | number | null
export type StatsSummaryRow = Record<StatsSummaryField, StatsSummaryValue>

const TIME_FIELDS = new Set<StatsSummaryField>(['acw', 'aht', 'hold', 'talk_time'])
const PERCENTAGE_FIELDS = new Set<StatsSummaryField>(['csat_score', 'dsat', 'mod', 'fcr'])
const TOTAL_FIELDS = new Set<StatsSummaryField>(['mod_value', 'fcr_value', 'surveys_answered'])

const isMissingValue = (value: StatsSummaryValue) => {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false

  return ['', '-', '–', '—', ':', 'not available'].includes(value.trim().toLowerCase())
}

const parseTimeToSeconds = (value: StatsSummaryValue) => {
  if (typeof value !== 'string' || isMissingValue(value)) return null

  const parts = value.trim().split(':').map(Number)
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some(part => !Number.isFinite(part) || part < 0)
  ) {
    return null
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

const formatSecondsAsTime = (value: number) => {
  const roundedSeconds = Math.round(value)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const parseNumericValue = (value: StatsSummaryValue, isPercentage: boolean) => {
  if (isMissingValue(value)) return null

  const hasPercentageSymbol = typeof value === 'string' && value.includes('%')
  const numericValue = typeof value === 'number'
    ? value
    : Number.parseFloat(String(value).replace(/[%\s,]/g, ''))

  if (!Number.isFinite(numericValue)) return null

  if (isPercentage && !hasPercentageSymbol && numericValue > 0 && numericValue < 1) {
    return numericValue * 100
  }

  return numericValue
}

const roundAverage = (value: number) => Math.round(value * 100) / 100

/**
 * Summarizes each scorecard metric independently so a missing value for one
 * metric does not remove an otherwise valid agent row from the whole summary.
 * Count metrics requested as team totals are summed; all other metrics are
 * averaged using only their valid values.
 */
export function averageStatsSummary(rows: Partial<StatsSummaryRow>[]): StatsSummaryRow | null {
  if (rows.length === 0) return null

  const summary = {} as StatsSummaryRow

  for (const field of STATS_SUMMARY_FIELDS) {
    const isTime = TIME_FIELDS.has(field)
    const isPercentage = PERCENTAGE_FIELDS.has(field)
    const values = rows
      .map(row => {
        const value = row[field] ?? null
        return isTime ? parseTimeToSeconds(value) : parseNumericValue(value, isPercentage)
      })
      .filter((value): value is number => value !== null)

    if (values.length === 0) {
      summary[field] = null
      continue
    }

    const average = values.reduce((total, value) => total + value, 0) / values.length
    summary[field] = TOTAL_FIELDS.has(field)
      ? roundAverage(values.reduce((total, value) => total + value, 0))
      : isTime
      ? formatSecondsAsTime(average)
      : isPercentage
        ? `${roundAverage(average)}%`
        : roundAverage(average)
  }

  return summary
}
