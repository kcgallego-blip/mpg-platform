export const MANILA_TIME_ZONE = 'Asia/Manila'

export type AttendanceRecord = {
  agent: string
  shift_date: string
  time_in: string | null
  time_out: string | null
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const isDateKey = (value: string) => {
  if (!DATE_KEY_PATTERN.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const getDateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || ''

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`
}

/**
 * Attendance shift dates use the fixed UTC-8 calendar date. This is the
 * requested UTC-8 equivalent of the current Philippine (UTC+8) instant.
 */
export const getDefaultShiftDate = (date = new Date()) => {
  const manilaParts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(manilaParts.find((part) => part.type === type)?.value || 0)

  const manilaWallClockAsUtc = Date.UTC(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
    getPart('second')
  )
  const sixteenHours = 16 * 60 * 60 * 1000
  const utcMinusEightEquivalent = new Date(manilaWallClockAsUtc - sixteenHours)

  return getDateKeyInTimeZone(utcMinusEightEquivalent, 'UTC')
}

export const parseDateKey = (value: string) => {
  if (!isDateKey(value)) {
    throw new Error(`Invalid date key: ${value}`)
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

export const getMonthRange = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  return {
    from: toDateKey(firstDay),
    to: toDateKey(lastDay),
  }
}

/**
 * Supabase returns `timestamp without time zone` as a wall-clock timestamp.
 * Extracting its clock portion avoids applying the viewer's browser timezone.
 */
export const formatAttendanceTime = (timestamp: string | null) => {
  if (!timestamp) return '--'

  const match = timestamp.match(/[T\s](\d{2}):(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}:${match[3]}` : '--'
}
