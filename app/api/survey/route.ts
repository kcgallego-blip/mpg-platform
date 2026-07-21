import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabase } from '@/lib/supabase'

const FUZZY_NAME_MATCH_THRESHOLD = 60
const MIN_SURVEY_WEEK = 27
const MIN_SURVEY_MONTH = 7
const SURVEY_FETCH_BATCH_SIZE = 1000
const SURVEY_FETCH_MAX_ROWS = 50000

const normalizeNameForMatch = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const getNameTokens = (value: string | null | undefined) =>
  Array.from(new Set(normalizeNameForMatch(value).split(/\s+/).filter(Boolean)))

const getFuzzyNameScore = (surveyAgent: string | null | undefined, userName: string | null | undefined) => {
  const normalizedSurveyAgent = normalizeNameForMatch(surveyAgent)
  const normalizedUserName = normalizeNameForMatch(userName)
  const userTokens = getNameTokens(userName)
  const surveyTokens = getNameTokens(surveyAgent)

  if (!normalizedSurveyAgent || !normalizedUserName || userTokens.length === 0 || surveyTokens.length === 0) {
    return 0
  }

  if (normalizedSurveyAgent === normalizedUserName) return 100
  if (normalizedSurveyAgent.includes(normalizedUserName) || normalizedUserName.includes(normalizedSurveyAgent)) return 90

  const surveyTokenSet = new Set(surveyTokens)
  const userTokenSet = new Set(userTokens)
  const matchedUserTokens = userTokens.filter(token => surveyTokenSet.has(token)).length
  const matchedSurveyTokens = surveyTokens.filter(token => userTokenSet.has(token)).length
  const firstToken = userTokens[0]
  const lastToken = userTokens[userTokens.length - 1]

  if (
    (firstToken && lastToken && surveyTokenSet.has(firstToken) && surveyTokenSet.has(lastToken)) ||
    matchedUserTokens === userTokens.length ||
    matchedSurveyTokens === surveyTokens.length
  ) {
    return 85
  }

  if (
    matchedUserTokens >= 2 &&
    ((firstToken && surveyTokenSet.has(firstToken)) || (lastToken && surveyTokenSet.has(lastToken)))
  ) {
    return 70
  }

  if (matchedUserTokens >= Math.ceil(userTokens.length * 0.6)) return 60

  return 0
}

const parsePeriodType = (value: string | null) => {
  return value === 'monthly' ? 'monthly' : 'weekly'
}

const getDate = (value: string | null | undefined) => {
  if (!value) return null
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const date = datePart
    ? new Date(`${datePart}T00:00:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getSurveyCalendarDate = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

const getSurveyWeekStartDate = (date: Date) => {
  const weekStart = getSurveyCalendarDate(date)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  return weekStart
}

const getSurveyWeekInfo = (date: Date) => {
  const calendarDate = getSurveyCalendarDate(date)
  const weekStart = getSurveyWeekStartDate(calendarDate)
  const yearStart = new Date(calendarDate.getFullYear(), 0, 1)
  const yearWeekStart = getSurveyWeekStartDate(yearStart)
  const daysSinceYearStart = (weekStart.getTime() - yearWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)

  return {
    year: calendarDate.getFullYear(),
    week: Math.floor(daysSinceYearStart) + 1,
    weekStart,
  }
}

const getWeekKey = (date: Date) => {
  const { year, week } = getSurveyWeekInfo(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

const getMonthKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const getWeekLabel = (date: Date) => {
  const { week, weekStart } = getSurveyWeekInfo(date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const rangeLabel = weekStart.getFullYear() === weekEnd.getFullYear() && weekStart.getMonth() === weekEnd.getMonth()
    ? `${monthDayFormatter.format(weekStart)} - ${fullDateFormatter.format(weekEnd)}`
    : `${fullDateFormatter.format(weekStart)} - ${fullDateFormatter.format(weekEnd)}`

  return `Week ${week} - ${rangeLabel}`
}

const getMonthLabel = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

const getPeriodOptions = (rows: any[], periodType: 'weekly' | 'monthly') => {
  const optionMap = new Map<string, { value: string; label: string; sortTime: number }>()

  for (const row of rows) {
    const date = getDate(row.survey_date)
    if (!date) continue

    if (periodType === 'weekly') {
      const { week, weekStart } = getSurveyWeekInfo(date)
      if (week < MIN_SURVEY_WEEK) continue

      const value = getWeekKey(date)
      if (!optionMap.has(value)) {
        optionMap.set(value, {
          value,
          label: getWeekLabel(date),
          sortTime: weekStart.getTime(),
        })
      }
    } else {
      const month = date.getMonth() + 1
      if (month < MIN_SURVEY_MONTH) continue

      const value = getMonthKey(date)
      if (!optionMap.has(value)) {
        optionMap.set(value, {
          value,
          label: getMonthLabel(date),
          sortTime: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
        })
      }
    }
  }

  return Array.from(optionMap.values()).sort((a, b) => b.sortTime - a.sortTime)
}

const isInPeriod = (surveyDate: string | null | undefined, periodType: 'weekly' | 'monthly', periodValue: string | null) => {
  const date = getDate(surveyDate)
  if (!date || !periodValue) return false

  return periodType === 'weekly'
    ? getWeekKey(date) === periodValue
    : getMonthKey(date) === periodValue
}

const fetchSurveyRows = async () => {
  const rows: any[] = []

  for (let from = 0; from < SURVEY_FETCH_MAX_ROWS; from += SURVEY_FETCH_BATCH_SIZE) {
    const to = Math.min(from + SURVEY_FETCH_BATCH_SIZE - 1, SURVEY_FETCH_MAX_ROWS - 1)
    const { data, error } = await supabase
      .from('survey')
      .select('*')
      .order('survey_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      return { rows, error }
    }

    rows.push(...(data || []))

    if (!data || data.length < SURVEY_FETCH_BATCH_SIZE) {
      break
    }
  }

  return { rows, error: null }
}

export async function GET(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)

    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || ''
    const isAgent = userRole.toLowerCase() === 'agent'
    const periodType = parsePeriodType(request.nextUrl.searchParams.get('periodType'))
    const requestedPeriod = request.nextUrl.searchParams.get('period')

    const { rows: surveyRows, error } = await fetchSurveyRows()

    if (error) {
      console.error('Survey fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch survey data' }, { status: 500 })
    }

    const scopedRows = isAgent
      ? (surveyRows || []).filter(row => getFuzzyNameScore(row.agent, userName) >= FUZZY_NAME_MATCH_THRESHOLD)
      : surveyRows || []
    const optionRows = surveyRows || []
    const weeklyOptions = isAgent ? getPeriodOptions(optionRows, 'weekly') : []
    const monthlyOptions = isAgent ? getPeriodOptions(optionRows, 'monthly') : []
    const periodOptions = periodType === 'monthly' ? monthlyOptions : weeklyOptions
    const selectedPeriod = periodOptions.some(option => option.value === requestedPeriod)
      ? requestedPeriod
      : periodOptions[0]?.value || null
    const rows = isAgent
      ? scopedRows.filter(row => isInPeriod(row.survey_date, periodType, selectedPeriod))
      : scopedRows

    return NextResponse.json({
      survey: rows,
      userRole,
      userName,
      totalFetchedRows: surveyRows.length,
      maxFetchedRows: SURVEY_FETCH_MAX_ROWS,
      isFetchTruncated: surveyRows.length >= SURVEY_FETCH_MAX_ROWS,
      periodType,
      periodValue: selectedPeriod,
      periodOptions: {
        weekly: weeklyOptions,
        monthly: monthlyOptions,
      },
    })
  } catch (error) {
    console.error('Survey API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
