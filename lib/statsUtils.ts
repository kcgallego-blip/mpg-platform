// Utility functions for stats validation and conversion

export interface TimeValue {
  minutes: number
  seconds: number
  totalSeconds: number
  formatted: string
}

export interface ParsedStats {
  [key: string]: string | number | null | TimeValue
}

export function getStatsWeekStartDate(date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - start.getDay())
  return start
}

export function getStatsWeekNumber(date = new Date()): number {
  const weekStart = getStatsWeekStartDate(date)
  const yearStart = new Date(date.getFullYear(), 0, 1)
  const yearWeekStart = getStatsWeekStartDate(yearStart)
  const daysSinceYearStart = (weekStart.getTime() - yearWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  return Math.floor(daysSinceYearStart) + 1
}

export function getStatsWeekRange(date = new Date()): number {
  return date.getDay() + 1
}

export function getStatsMonthName(month: number, referenceDate = new Date()): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(referenceDate.getFullYear(), month - 1, 1))
}

export function getStatsMonthOptions(): number[] {
  return [5, 6, 7]
}

export function getStatsPeriodLabel(
  periodType: 'weekly' | 'monthly',
  periodValue: number,
  referenceDate = new Date()
): string {
  if (periodType === 'monthly') {
    return getStatsMonthName(periodValue, referenceDate)
  }

  return getStatsWeekRangeLabel(periodValue, getStatsWeekRange(referenceDate), referenceDate)
}

export function getStatsWeekRangeDates(
  week: number,
  range: number,
  referenceDate = new Date()
): { startDate: Date; endDate: Date } {
  const referenceYearStart = new Date(referenceDate.getFullYear(), 0, 1)
  const startDate = getStatsWeekStartDate(referenceYearStart)
  startDate.setDate(startDate.getDate() + (week - 1) * 7)

  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + range - 1)

  return { startDate, endDate }
}

export function getStatsWeekRangeLabel(week: number, range: number, referenceDate = new Date()): string {
  const safeWeek = Math.max(1, Math.floor(week) || 1)
  const safeRange = Math.max(1, Math.min(7, Math.floor(range) || getStatsWeekRange(referenceDate)))
  const { startDate, endDate } = getStatsWeekRangeDates(safeWeek, safeRange, referenceDate)

  const monthDayFormatter = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
  })
  const fullDateFormatter = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    return `${monthDayFormatter.format(startDate)} - ${fullDateFormatter.format(endDate)}`
  }

  return `${fullDateFormatter.format(startDate)} - ${fullDateFormatter.format(endDate)}`
}

export function formatStatsDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getStatsWeekDateOptions(week: number, referenceDate = new Date()): string[] {
  const { startDate } = getStatsWeekRangeDates(week, 1, referenceDate)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    return formatStatsDate(date)
  })
}

export function getStatsRangeFromDate(week: number, endDate: string, referenceDate = new Date()): number {
  const { startDate } = getStatsWeekRangeDates(week, 1, referenceDate)
  const [year, month, day] = endDate.split('-').map(Number)
  const parsedEndDate = new Date(year || 0, (month || 1) - 1, day || 1)
  const startOfDay = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth(), parsedEndDate.getDate())
  const dayDifference = Math.round((startOfDay.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
  return Math.min(Math.max(dayDifference + 1, 1), 7)
}

/**
 * Converts time string (MM:SS or HH:MM:SS) to seconds
 */
export function timeToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr || timeStr.trim() === '') return null
  
  try {
    const parts = timeStr.trim().split(':').map(p => parseInt(p, 10))
    
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return null
  } catch {
    return null
  }
}

/**
 * Converts seconds to MM:SS format
 */
export function secondsToTime(seconds: number | null): string {
  if (seconds === null) return ''
  
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Parses percentage string (e.g., "87.50%" to 87.5)
 */
export function parsePercentage(value: string | null | undefined): number | null {
  if (!value || value.trim() === '') return null
  
  try {
    return parseFloat(value.replace('%', '').trim())
  } catch {
    return null
  }
}

/**
 * Passing score criteria
 */
export const PASSING_CRITERIA = {
  ACW: { maxSeconds: 120, type: 'time' }, // 2:00
  AHT: { maxSeconds: 540, type: 'time' }, // 9:00
  Hold: { maxSeconds: 120, type: 'time' }, // 2:00
  Talk_Time: { maxSeconds: 540, type: 'time' }, // 9:00
  CSAT_Score: { minPercentage: 87, type: 'percentage' }, // 87%+
  DSAT: { type: 'na' },
  NPS_Score: { minValue: 50, type: 'number' }, // 50+
  Promoter: { type: 'na' },
  MOD: { minPercentage: 30, type: 'percentage' }, // 30%+
  MOD_Value: { type: 'na' },
  FCR: { minPercentage: 80, type: 'percentage' }, // 80%+
  FCR_Value: { type: 'na' },
  Surveys_Answered: { type: 'na' },
  Calls_Touched: { type: 'na' },
  Tickets_Solved: { type: 'na' },
  Transactions: { type: 'na' },
  Productive_Hours: { type: 'na' },
  TPH: { minValue: 6, type: 'number' }, // 6+
}

const NORMALIZED_PASSING_CRITERIA: Record<string, (typeof PASSING_CRITERIA)[keyof typeof PASSING_CRITERIA]> = {}

for (const [fieldName, criteria] of Object.entries(PASSING_CRITERIA)) {
  const normalizedFieldName = fieldName
    .replace(/\s+/g, '_')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\*/g, '')
    .toLowerCase()

  NORMALIZED_PASSING_CRITERIA[normalizedFieldName] = criteria
}

export function isScorePassing(
  fieldName: string,
  value: string | number | null | undefined
): boolean {
  if (value === null || value === undefined || value === '') return false

  const normalizedFieldName = fieldName
    .replace(/\s+/g, '_')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\*/g, '')
    .toLowerCase()

  const criteria = NORMALIZED_PASSING_CRITERIA[normalizedFieldName]

  if (!criteria || criteria.type === 'na') return false

  try {
    if (criteria.type === 'time' && 'maxSeconds' in criteria) {
      const seconds = typeof value === 'string' ? timeToSeconds(value) : value
      if (seconds === null) return false
      return seconds <= criteria.maxSeconds
    } else if (criteria.type === 'percentage' && 'minPercentage' in criteria) {
      let percentage = typeof value === 'string' ? parsePercentage(value) : value
      if (percentage === null) return false
      // Normalize percentage to 0-100 range if it's in decimal form (0-1)
      if (typeof percentage === 'number' && percentage > 0 && percentage < 1) {
        percentage = percentage * 100
      }
      return percentage >= criteria.minPercentage
    } else if (criteria.type === 'number' && 'minValue' in criteria) {
      const numValue = typeof value === 'string' ? parseFloat(value) : value
      if (isNaN(numValue as number)) return false
      return numValue >= criteria.minValue
    }
  } catch {
    return false
  }

  return false
}

/**
 * Determines if a score should be hidden (N/A fields)
 */
export function isNAField(fieldName: string): boolean {
  const normalizedFieldName = fieldName
    .replace(/\s+/g, '_')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\*/g, '')
    .toLowerCase()

  const criteria = NORMALIZED_PASSING_CRITERIA[normalizedFieldName]
  return criteria?.type === 'na'
}

/**
 * Formats display value for a stat field
 */
export function formatStatValue(
  value: string | number | null | undefined,
  fieldName?: string
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && value.trim() === ':') return ''
  if (typeof value === 'string' && value.trim() === '-') {
    const normalizedFieldName = fieldName
      ?.replace(/\s+/g, '_')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\*/g, '')
      .toLowerCase()

    if (normalizedFieldName === 'tph') return 'Not available'
  }

  const normalizedFieldName = fieldName
    ?.replace(/\s+/g, '_')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\*/g, '')
    .toLowerCase()

  if (normalizedFieldName === 'nps_score') {
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!isNaN(numValue as number)) return String(Math.round(numValue as number))
  }

  if (['mod_value', 'fcr_value', 'surveys_answered'].includes(normalizedFieldName || '')) {
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!isNaN(numValue as number)) return String(Math.round(numValue as number))
  }

  if (['csat_score', 'fcr', 'mod'].includes(normalizedFieldName || '')) {
    const stringValue = typeof value === 'string' ? value : String(value)
    if (stringValue.includes('%')) {
      const percentage = parsePercentage(stringValue)
      if (percentage !== null) return `${Math.round(percentage)}%`
    } else {
      const percentage = typeof value === 'number' ? value : parseFloat(value)
      if (!isNaN(percentage as number)) return `${Math.round(percentage as number)}%`
    }
  }

  return String(value)
}
