const DAYS_PER_WEEK = 7
const MILLISECONDS_PER_DAY = 86_400_000

export type IsoWeek = {
  week: number
  year: number
}

/**
 * Returns the ISO-8601 week for an instant as observed at a fixed UTC offset.
 * ISO weeks begin on Monday and belong to the year containing their Thursday.
 */
export function getIsoWeekAtUtcOffset(
  date = new Date(),
  utcOffsetHours = 0
): IsoWeek {
  const shiftedDate = new Date(date.getTime() + utcOffsetHours * 60 * 60 * 1000)
  const calendarDate = new Date(Date.UTC(
    shiftedDate.getUTCFullYear(),
    shiftedDate.getUTCMonth(),
    shiftedDate.getUTCDate()
  ))

  const isoDay = calendarDate.getUTCDay() || DAYS_PER_WEEK
  calendarDate.setUTCDate(calendarDate.getUTCDate() + 4 - isoDay)

  const year = calendarDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(
    (((calendarDate.getTime() - yearStart.getTime()) / MILLISECONDS_PER_DAY) + 1) /
      DAYS_PER_WEEK
  )

  return { week, year }
}
