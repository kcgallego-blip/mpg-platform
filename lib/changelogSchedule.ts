export const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
export const MANILA_RELEASE_HOUR = 18

function getShiftedManilaDate(nowMs: number) {
  return new Date(nowMs + MANILA_UTC_OFFSET_MS)
}

function toUtcTimestamp(manilaDate: Date, dayOffset: number) {
  return Date.UTC(
    manilaDate.getUTCFullYear(),
    manilaDate.getUTCMonth(),
    manilaDate.getUTCDate() + dayOffset,
    MANILA_RELEASE_HOUR
  ) - MANILA_UTC_OFFSET_MS
}

export function getNextManilaSixPm(nowMs = Date.now()) {
  const manilaDate = getShiftedManilaDate(nowMs)
  const todayAtSix = toUtcTimestamp(manilaDate, 0)
  return todayAtSix > nowMs ? todayAtSix : toUtcTimestamp(manilaDate, 1)
}

export function getMostRecentManilaSixPm(nowMs = Date.now()) {
  const manilaDate = getShiftedManilaDate(nowMs)
  const todayAtSix = toUtcTimestamp(manilaDate, 0)
  return todayAtSix <= nowMs ? todayAtSix : toUtcTimestamp(manilaDate, -1)
}

export function isScheduledChangelogCheckDue(
  lastSuccessfulCheckMs: number | null,
  nowMs = Date.now()
) {
  return (
    lastSuccessfulCheckMs === null ||
    lastSuccessfulCheckMs < getMostRecentManilaSixPm(nowMs)
  )
}
