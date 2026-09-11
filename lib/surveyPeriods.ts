export type SurveyPeriodType = 'weekly' | 'monthly'

export type SurveyPeriodOption = {
  value: string
  label: string
  sortTime: number
}

const MIN_SURVEY_WEEK = 27
const MIN_SURVEY_MONTH = 7

const getDate = (value: string | null | undefined) => {
  if (!value) return null
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const date = datePart ? new Date(`${datePart}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getCalendarDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const getWeekStartDate = (date: Date) => {
  const weekStart = getCalendarDate(date)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  return weekStart
}

const getWeekInfo = (date: Date) => {
  const calendarDate = getCalendarDate(date)
  const weekStart = getWeekStartDate(calendarDate)
  const yearWeekStart = getWeekStartDate(new Date(calendarDate.getFullYear(), 0, 1))
  const daysSinceYearStart = (weekStart.getTime() - yearWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)

  return {
    year: calendarDate.getFullYear(),
    week: Math.floor(daysSinceYearStart) + 1,
    weekStart,
  }
}

const getWeekKey = (date: Date) => {
  const { year, week } = getWeekInfo(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const getWeekLabel = (date: Date) => {
  const { week, weekStart } = getWeekInfo(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const shortFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  const fullFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const sameMonth = weekStart.getFullYear() === weekEnd.getFullYear() && weekStart.getMonth() === weekEnd.getMonth()
  const rangeLabel = sameMonth
    ? `${shortFormatter.format(weekStart)} - ${fullFormatter.format(weekEnd)}`
    : `${fullFormatter.format(weekStart)} - ${fullFormatter.format(weekEnd)}`

  return `Week ${week} - ${rangeLabel}`
}

const getMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)

export function getSurveyPeriodOptions(
  rows: Array<{ survey_date: string | null }>,
  periodType: SurveyPeriodType,
  currentDate = new Date(),
) {
  const optionMap = new Map<string, SurveyPeriodOption>()

  rows.forEach((row) => {
    const date = getDate(row.survey_date)
    if (!date) return

    if (periodType === 'weekly') {
      const { week, weekStart } = getWeekInfo(date)
      if (week < MIN_SURVEY_WEEK) return
      const value = getWeekKey(date)
      if (!optionMap.has(value)) {
        optionMap.set(value, { value, label: getWeekLabel(date), sortTime: weekStart.getTime() })
      }
      return
    }

    const month = date.getMonth() + 1
    if (month < MIN_SURVEY_MONTH) return
    const value = getMonthKey(date)
    if (!optionMap.has(value)) {
      optionMap.set(value, {
        value,
        label: getMonthLabel(date),
        sortTime: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
      })
    }
  })

  if (periodType === 'weekly') {
    const { weekStart } = getWeekInfo(currentDate)
    const value = getWeekKey(currentDate)
    if (!optionMap.has(value)) {
      optionMap.set(value, {
        value,
        label: getWeekLabel(currentDate),
        sortTime: weekStart.getTime(),
      })
    }
  }

  return Array.from(optionMap.values()).sort((first, second) => second.sortTime - first.sortTime)
}

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function getSurveyPeriodRange(periodType: SurveyPeriodType, value: string) {
  if (periodType === 'monthly') {
    const match = value.match(/^(\d{4})-(\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const monthIndex = Number(match[2]) - 1
    const from = new Date(year, monthIndex, 1)
    const to = new Date(year, monthIndex + 1, 0)
    if (Number.isNaN(from.getTime()) || monthIndex < 0 || monthIndex > 11) return null
    return { from: toDateKey(from), to: toDateKey(to) }
  }

  const match = value.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const week = Number(match[2])
  if (week < 1 || week > 54) return null
  const from = getWeekStartDate(new Date(year, 0, 1))
  from.setDate(from.getDate() + (week - 1) * 7)
  const to = new Date(from)
  to.setDate(to.getDate() + 6)
  return { from: toDateKey(from), to: toDateKey(to) }
}
