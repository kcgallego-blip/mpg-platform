import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  resolveRosterScopedAgentNames,
} from '@/lib/statsIdentity'

const MIN_SURVEY_WEEK = 27
const MIN_SURVEY_MONTH = 7
const MAX_PAGE_SIZE = 50
const AGENT_NAME_CANDIDATE_LIMIT = 100
const NO_AGENT_MATCH = '__mpg_no_agent_match__'
const SURVEY_COLUMNS = 'survey_date, response_id, agent, csat, mod_comment, open_comment, created_at'
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

type PeriodType = 'weekly' | 'monthly'
type PeriodOption = { value: string; label: string; sortTime: number }

const parsePeriodType = (value: string | null): PeriodType => value === 'monthly' ? 'monthly' : 'weekly'

const parsePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

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

const getPeriodOptions = (rows: Array<{ survey_date: string | null }>, periodType: PeriodType) => {
  const optionMap = new Map<string, PeriodOption>()

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

  return Array.from(optionMap.values()).sort((first, second) => second.sortTime - first.sortTime)
}

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const getPeriodRange = (periodType: PeriodType, value: string) => {
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

async function getCanonicalAgentName(email: string) {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('name')
    .ilike('email', email.trim())
    .limit(1)

  if (error) {
    console.error('Survey canonical agent lookup error:', error)
    return null
  }

  return data?.[0]?.name?.trim() || null
}

async function resolveSurveyAgentNames(identityNames: string[]) {
  const candidateSet = new Set<string>()

  for (const identityName of identityNames) {
    const exactResult = await supabaseAdmin
      .from('survey')
      .select('agent')
      .not('agent', 'is', null)
      .ilike('agent', identityName)
      .limit(1)

    if (exactResult.error) throw exactResult.error
    const exactName = exactResult.data?.[0]?.agent?.trim()
    if (exactName) candidateSet.add(exactName)

    const candidateResults = await Promise.all(getStatsNameSearchFragments(identityName).map(fragment =>
      supabaseAdmin
        .from('survey')
        .select('agent')
        .not('agent', 'is', null)
        .ilike('agent', `%${fragment}%`)
        .order('survey_date', { ascending: false, nullsFirst: false })
        .limit(AGENT_NAME_CANDIDATE_LIMIT)
    ))
    const failedResult = candidateResults.find(result => result.error)
    if (failedResult?.error) throw failedResult.error

    candidateResults.forEach(result => {
      ((result.data || []) as Array<{ agent?: string | null }>).forEach(row => {
        const candidate = row.agent?.trim()
        if (candidate) candidateSet.add(candidate)
      })
    })
  }

  const candidates = Array.from(candidateSet)
  if (candidates.length === 0) return []

  const rosterResult = await supabaseAdmin.from('agents').select('name')
  if (rosterResult.error) throw rosterResult.error
  const rosterNames = ((rosterResult.data || []) as Array<{ name?: string | null }>)
    .map(row => row.name?.trim())
    .filter((name): name is string => Boolean(name))

  return resolveRosterScopedAgentNames(candidates, identityNames, rosterNames)
}

async function getSurveyPeriodDates(agentName: string | null) {
  const { data, error } = await supabaseAdmin.rpc('get_survey_period_dates', {
    p_agent_name: agentName,
  })

  if (!error) return (data || []) as Array<{ survey_date: string | null }>

  console.warn('Survey period RPC unavailable; using bounded date fallback:', error.message)
  let fallbackQuery = supabaseAdmin
    .from('survey')
    .select('survey_date')
    .not('survey_date', 'is', null)
    .order('survey_date', { ascending: false })
    .limit(366)

  if (agentName) fallbackQuery = fallbackQuery.ilike('agent', agentName)
  const fallback = await fallbackQuery
  if (fallback.error) throw fallback.error
  return (fallback.data || []) as Array<{ survey_date: string | null }>
}

async function getSurveyPage(params: {
  agentNames: string[] | null
  from: string
  to: string
  search: string
  offset: number
  pageSize: number
}) {
  const rpcResult = !params.agentNames || params.agentNames.length === 1
    ? await supabaseAdmin.rpc('get_survey_page', {
        p_from: params.from,
        p_to: params.to,
        p_agent_name: params.agentNames?.[0] || null,
        p_search: params.search || null,
        p_offset: params.offset,
        p_limit: params.pageSize,
      })
    : null

  if (rpcResult && !rpcResult.error) {
    const rows = (rpcResult.data || []) as Array<Record<string, unknown> & { total_count?: number }>
    const total = Number(rows[0]?.total_count || 0)
    return {
      rows: rows.map(({ total_count: _totalCount, ...row }) => row),
      total,
    }
  }

  if (rpcResult?.error) {
    console.warn('Survey page RPC unavailable; using PostgREST filters:', rpcResult.error.message)
  }
  let query = supabaseAdmin
    .from('survey')
    .select(SURVEY_COLUMNS, { count: 'exact' })
    .gte('survey_date', params.from)
    .lte('survey_date', params.to)
    .order('survey_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.pageSize - 1)

  if (params.agentNames?.length === 1) query = query.ilike('agent', params.agentNames[0])
  if (params.agentNames && params.agentNames.length > 1) query = query.in('agent', params.agentNames)
  if (params.search) {
    const search = params.search.replace(/[(),]/g, ' ').trim()
    query = query.or(`response_id.ilike.%${search}%,agent.ilike.%${search}%,csat.ilike.%${search}%,mod_comment.ilike.%${search}%,open_comment.ilike.%${search}%`)
  }

  const result = await query
  if (result.error) throw result.error
  return { rows: result.data || [], total: result.count || 0 }
}

export async function GET(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)
    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: noStoreHeaders })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || ''
    const isAgent = userRole.trim().toLowerCase() === 'agent'
    const canonicalAgentName = isAgent ? await getCanonicalAgentName(dbUser.email) : null
    const agentIdentityNames = isAgent
      ? getUniqueStatsIdentityNames([userName, canonicalAgentName])
      : []
    const resolvedAgentNames = isAgent && agentIdentityNames.length > 0
      ? await resolveSurveyAgentNames(agentIdentityNames)
      : []
    const surveyAgentNames = isAgent
      ? resolvedAgentNames.length > 0 ? resolvedAgentNames : [NO_AGENT_MATCH]
      : null
    const periodType = parsePeriodType(request.nextUrl.searchParams.get('periodType'))
    const requestedPeriod = request.nextUrl.searchParams.get('period')
    const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1)
    const pageSize = Math.min(parsePositiveInteger(request.nextUrl.searchParams.get('pageSize'), MAX_PAGE_SIZE), MAX_PAGE_SIZE)
    const search = (request.nextUrl.searchParams.get('search') || '').trim().slice(0, 200)

    const periodDates = surveyAgentNames
      ? (await Promise.all(surveyAgentNames.map(getSurveyPeriodDates))).flat()
      : await getSurveyPeriodDates(null)
    const weeklyOptions = getPeriodOptions(periodDates, 'weekly')
    const monthlyOptions = getPeriodOptions(periodDates, 'monthly')
    const activeOptions = periodType === 'monthly' ? monthlyOptions : weeklyOptions
    const periodValue = activeOptions.some((option) => option.value === requestedPeriod)
      ? requestedPeriod as string
      : activeOptions[0]?.value || ''
    const periodRange = periodValue ? getPeriodRange(periodType, periodValue) : null

    if (!periodRange) {
      return NextResponse.json({
        survey: [],
        total: 0,
        page: 1,
        pageSize,
        userRole,
        userName,
        periodType,
        periodValue,
        periodOptions: { weekly: weeklyOptions, monthly: monthlyOptions },
      }, { headers: noStoreHeaders })
    }

    const result = await getSurveyPage({
      agentNames: surveyAgentNames,
      from: periodRange.from,
      to: periodRange.to,
      search,
      offset: (page - 1) * pageSize,
      pageSize,
    })

    return NextResponse.json({
      survey: result.rows,
      total: result.total,
      page,
      pageSize,
      userRole,
      userName,
      periodType,
      periodValue,
      periodOptions: { weekly: weeklyOptions, monthly: monthlyOptions },
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('Survey API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: noStoreHeaders })
  }
}
