import 'server-only'

import type { AuthenticatedDbUser } from './sessionAuth'
import { supabaseAdmin } from './supabaseAdmin'
import {
  buildHomeInsightCandidates,
  collapseWeeklyStats,
  getAgentFirstName,
  getManilaDateKey,
  type HomeInsightCategory,
  type HomeStatsSnapshot,
  type HomeSurveyFeedback,
  selectWeightedHomeInsight,
} from './homeInsights'
import { generateHomeMessage } from './homeMessageGenerator'
import {
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  resolveStatsNameFromCandidates,
} from './statsIdentity'

type StoredHomeMessage = {
  agent_email: string
  message_date: string
  message: string
  source_category: HomeInsightCategory
  generated_at: string
  refresh_used: boolean
}

type AgentRosterIdentity = {
  name: string | null
  email: string | null
}

type WeeklyStatsRow = HomeStatsSnapshot & {
  week: number
  range: number
  created_at: string
}

type MonthlyStatsRow = HomeStatsSnapshot & {
  month: number | string
  created_at: string
}

type SurveyRow = HomeSurveyFeedback & {
  agent: string
}

export type HomeMessageResult = {
  message: string
  generatedAt: string
  canRegenerate: boolean
}

export class HomeMessageConflictError extends Error {
  constructor(public readonly current: HomeMessageResult) {
    super('The daily message has already been regenerated')
    this.name = 'HomeMessageConflictError'
  }
}

const isUnlimitedRegenerationEnabled = () =>
  process.env.NODE_ENV !== 'production'
  || process.env.HOME_MESSAGE_UNLIMITED_REGENERATION === 'true'

const toMessageResult = (
  row: StoredHomeMessage,
  unlimitedRegeneration = false
): HomeMessageResult => ({
  message: row.message,
  generatedAt: row.generated_at,
  canRegenerate: unlimitedRegeneration || !row.refresh_used,
})

async function getStoredMessage(agentEmail: string, messageDate: string) {
  const { data, error } = await supabaseAdmin
    .from('home_messages')
    .select('agent_email, message_date, message, source_category, generated_at, refresh_used')
    .eq('agent_email', agentEmail)
    .eq('message_date', messageDate)
    .maybeSingle()

  if (error) throw error
  return data as StoredHomeMessage | null
}

async function getPreviousCategory(agentEmail: string, messageDate: string) {
  const { data, error } = await supabaseAdmin
    .from('home_messages')
    .select('source_category')
    .eq('agent_email', agentEmail)
    .lt('message_date', messageDate)
    .order('message_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data?.source_category || null) as HomeInsightCategory | null
}

async function fetchNameCandidates(
  tables: string[],
  column: string,
  identityNames: string[]
) {
  const identities = getUniqueStatsIdentityNames(identityNames)
  const exactResults = await Promise.all(
    tables.flatMap(table => identities.map(identityName =>
      supabaseAdmin.from(table).select(column).ilike(column, identityName).limit(10)
    ))
  )
  const exactCandidates = exactResults.flatMap(result =>
    result.error
      ? []
      : ((result.data || []) as unknown as Array<Record<string, unknown>>)
          .map(row => typeof row[column] === 'string' ? row[column].trim() : '')
          .filter(Boolean)
  )
  const exactMatch = resolveStatsNameFromCandidates(Array.from(new Set(exactCandidates)), identities)
  if (exactMatch) return exactMatch

  const searches = identities.flatMap(identityName =>
    getStatsNameSearchFragments(identityName).map(fragment => `%${fragment}%`)
  )
  if (searches.length === 0) return null

  const candidateResults = await Promise.all(
    tables.flatMap(table => searches.map(search =>
      supabaseAdmin.from(table).select(column).ilike(column, search).limit(30)
    ))
  )
  const candidates = candidateResults.flatMap(result =>
    result.error
      ? []
      : ((result.data || []) as unknown as Array<Record<string, unknown>>)
          .map(row => typeof row[column] === 'string' ? row[column].trim() : '')
          .filter(Boolean)
  )

  return resolveStatsNameFromCandidates(Array.from(new Set(candidates)), identities)
}

async function getAgentInsightData(user: AuthenticatedDbUser) {
  const { data: rosterData, error: rosterError } = await supabaseAdmin
    .from('agents')
    .select('name, email')
    .ilike('email', user.email)
    .limit(2)

  if (rosterError) throw rosterError
  const rosterRows = (rosterData || []) as AgentRosterIdentity[]
  const rosterIdentity = rosterRows.length === 1 ? rosterRows[0] : null
  const identityNames = getUniqueStatsIdentityNames([user.name, rosterIdentity?.name])

  if (identityNames.length === 0) {
    return {
      weeklyStats: [],
      monthlyStats: null,
      feedback: null,
    }
  }

  const [statsName, surveyName] = await Promise.all([
    fetchNameCandidates(['stats', 'stats_month'], 'name', identityNames),
    fetchNameCandidates(['survey'], 'agent', identityNames),
  ])

  const weeklyPromise = statsName
    ? supabaseAdmin
        .from('stats')
        .select('week, range, created_at, csat_score, acw, aht, tph, surveys_answered')
        .eq('name', statsName)
        .order('created_at', { ascending: false })
        .limit(60)
    : Promise.resolve({ data: [], error: null })
  const monthlyPromise = statsName
    ? supabaseAdmin
        .from('stats_month')
        .select('month, created_at, csat_score, acw, aht, tph, surveys_answered')
        .eq('name', statsName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })
  const surveyPromise = surveyName
    ? supabaseAdmin
        .from('survey')
        .select('agent, survey_date, mod_comment, open_comment')
        .eq('agent', surveyName)
        .eq('csat', 'Satisfied')
        .order('survey_date', { ascending: false, nullsFirst: false })
        .limit(20)
    : Promise.resolve({ data: [], error: null })

  const [weeklyResult, monthlyResult, surveyResult] = await Promise.all([
    weeklyPromise,
    monthlyPromise,
    surveyPromise,
  ])

  if (weeklyResult.error) throw weeklyResult.error
  if (surveyResult.error) throw surveyResult.error

  const feedback = ((surveyResult.data || []) as SurveyRow[]).find(row =>
    Boolean(row.open_comment?.trim() || row.mod_comment?.trim())
  ) || null

  return {
    weeklyStats: collapseWeeklyStats((weeklyResult.data || []) as WeeklyStatsRow[]),
    // Monthly Stats is optional in older local databases. Weekly and survey
    // context should remain usable until that table is available.
    monthlyStats: monthlyResult.error ? null : monthlyResult.data as MonthlyStatsRow | null,
    feedback,
  }
}

async function createGeneratedMessage(
  user: AuthenticatedDbUser,
  previousCategory: HomeInsightCategory | null
) {
  const insightData = await getAgentInsightData(user)
  const candidates = buildHomeInsightCandidates(insightData)
  const insight = selectWeightedHomeInsight(candidates, previousCategory)

  if (!insight) {
    throw new Error('No home message insight could be selected')
  }

  const message = await generateHomeMessage({
    firstName: getAgentFirstName(user.name),
    insight,
  })

  return { message, category: insight.category }
}

export async function getOrGenerateHomeMessage(
  user: AuthenticatedDbUser,
  regenerate = false
): Promise<HomeMessageResult> {
  const agentEmail = user.email.trim().toLowerCase()
  const messageDate = getManilaDateKey()
  const unlimitedRegeneration = isUnlimitedRegenerationEnabled()
  const current = await getStoredMessage(agentEmail, messageDate)

  if (current && !regenerate) return toMessageResult(current, unlimitedRegeneration)
  if (current?.refresh_used && regenerate && !unlimitedRegeneration) {
    throw new HomeMessageConflictError(toMessageResult(current))
  }

  const previousCategory = await getPreviousCategory(agentEmail, messageDate)
  const generated = await createGeneratedMessage(user, previousCategory)
  const generatedAt = new Date().toISOString()

  if (current) {
    let updateQuery = supabaseAdmin
      .from('home_messages')
      .update({
        message: generated.message,
        source_category: generated.category,
        generated_at: generatedAt,
        refresh_used: unlimitedRegeneration ? false : true,
      })
      .eq('agent_email', agentEmail)
      .eq('message_date', messageDate)

    if (!unlimitedRegeneration) {
      updateQuery = updateQuery.eq('refresh_used', false)
    }

    const { data, error } = await updateQuery
      .select('agent_email, message_date, message, source_category, generated_at, refresh_used')
      .maybeSingle()

    if (error) throw error
    if (data) return toMessageResult(data as StoredHomeMessage, unlimitedRegeneration)

    const winner = await getStoredMessage(agentEmail, messageDate)
    if (winner) throw new HomeMessageConflictError(toMessageResult(winner))
    throw new Error('The home message changed while it was being regenerated')
  }

  const { data, error } = await supabaseAdmin
    .from('home_messages')
    .insert({
      agent_email: agentEmail,
      message_date: messageDate,
      message: generated.message,
      source_category: generated.category,
      generated_at: generatedAt,
      refresh_used: false,
    })
    .select('agent_email, message_date, message, source_category, generated_at, refresh_used')
    .single()

  if (!error && data) return toMessageResult(data as StoredHomeMessage, unlimitedRegeneration)

  if (error?.code === '23505') {
    const winner = await getStoredMessage(agentEmail, messageDate)
    if (winner) return toMessageResult(winner, unlimitedRegeneration)
  }

  throw error || new Error('Failed to save the home message')
}
