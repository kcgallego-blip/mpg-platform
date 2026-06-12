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
      const percentage = typeof value === 'string' ? parsePercentage(value) : value
      if (percentage === null) return false
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
