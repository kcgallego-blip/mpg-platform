export const STAFFING_EASTERN_TIME_ZONE = 'America/New_York'
export const STAFFING_RESET_HOUR = 6

type EasternDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const easternFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STAFFING_EASTERN_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false,
  hourCycle: 'h23',
})

const getEasternParts = (date: Date): EasternDateParts => {
  const parts = easternFormatter.formatToParts(date)
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value || 0)

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  }
}

const addLocalDays = (parts: EasternDateParts, days: number) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

const getEasternOffsetMs = (date: Date) => {
  const parts = getEasternParts(date)
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const sourceWithoutMilliseconds = Math.floor(date.getTime() / 1000) * 1000
  return representedAsUtc - sourceWithoutMilliseconds
}

const easternDateTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number
) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour)
  const firstOffset = getEasternOffsetMs(new Date(utcGuess))
  const firstResult = new Date(utcGuess - firstOffset)
  const correctedOffset = getEasternOffsetMs(firstResult)

  return new Date(utcGuess - correctedOffset)
}

const getResetForLocalDay = (parts: EasternDateParts, dayOffset: number) => {
  const localDate = addLocalDays(parts, dayOffset)
  return easternDateTimeToUtc(
    localDate.year,
    localDate.month,
    localDate.day,
    STAFFING_RESET_HOUR
  )
}

export const getLatestStaffingResetBoundary = (now = new Date()) => {
  const parts = getEasternParts(now)
  const todayReset = getResetForLocalDay(parts, 0)
  return now.getTime() >= todayReset.getTime()
    ? todayReset
    : getResetForLocalDay(parts, -1)
}

export const getMillisecondsUntilNextStaffingReset = (now = new Date()) => {
  const parts = getEasternParts(now)
  const todayReset = getResetForLocalDay(parts, 0)
  const nextReset = now.getTime() < todayReset.getTime()
    ? todayReset
    : getResetForLocalDay(parts, 1)

  return Math.max(0, nextReset.getTime() - now.getTime())
}

export const getStaffingResetCycleKey = (now = new Date()) => {
  const boundaryParts = getEasternParts(getLatestStaffingResetBoundary(now))
  return [
    boundaryParts.year,
    String(boundaryParts.month).padStart(2, '0'),
    String(boundaryParts.day).padStart(2, '0'),
  ].join('-')
}
