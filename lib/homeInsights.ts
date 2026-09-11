import {
  formatStatValue,
  isScorePassing,
  parsePercentage,
  timeToSeconds,
} from './statsUtils.ts'

export type HomeMetricField = 'csat_score' | 'acw' | 'aht' | 'tph'

export type HomeStatsSnapshot = {
  week?: number | null
  month?: number | string | null
  range?: number | null
  created_at?: string | null
  csat_score?: string | number | null
  acw?: string | number | null
  aht?: string | number | null
  tph?: string | number | null
  surveys_answered?: number | null
}

export type HomeSurveyFeedback = {
  survey_date?: string | null
  mod_comment?: string | null
  open_comment?: string | null
}

export type HomeInsightCategory =
  | 'repeated_kpi_miss'
  | 'customer_praise'
  | 'kpi_improvement'
  | 'kpi_passing_streak'
  | 'current_kpi_miss'
  | 'period_summary'
  | 'survey_participation'
  | 'generic'

export type HomeInsightCandidate = {
  category: HomeInsightCategory
  weight: number
  context: string
}

type MetricDefinition = {
  field: HomeMetricField
  label: string
  direction: 'higher' | 'lower'
  target: string
  targetValue: number
}

export const HOME_MAIN_METRICS: MetricDefinition[] = [
  { field: 'csat_score', label: 'CSAT', direction: 'higher', target: '87% or higher', targetValue: 87 },
  { field: 'acw', label: 'ACW', direction: 'lower', target: '2:00 or lower', targetValue: 120 },
  { field: 'aht', label: 'AHT', direction: 'lower', target: '9:00 or lower', targetValue: 540 },
  { field: 'tph', label: 'TPH', direction: 'higher', target: '6 or higher', targetValue: 6 },
]

const getMetricNumber = (
  metric: MetricDefinition,
  value: string | number | null | undefined
) => {
  if (value === null || value === undefined || value === '') return null

  if (metric.field === 'acw' || metric.field === 'aht') {
    const seconds = typeof value === 'number' ? value : timeToSeconds(value)
    return seconds !== null && Number.isFinite(seconds) ? seconds : null
  }

  if (metric.field === 'csat_score') {
    const parsed = typeof value === 'number' ? value : parsePercentage(value)
    if (parsed === null || Number.isNaN(parsed)) return null
    return parsed > 0 && parsed < 1 ? parsed * 100 : parsed
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getCurrentPeriodLabel = (snapshot: HomeStatsSnapshot) => {
  if (snapshot.week) return `week ${snapshot.week}`
  if (snapshot.month) return `month ${snapshot.month}`
  return 'the latest period'
}

const getPassingMetrics = (snapshot: HomeStatsSnapshot) =>
  HOME_MAIN_METRICS.filter(metric => {
    const value = snapshot[metric.field]
    return getMetricNumber(metric, value) !== null && isScorePassing(metric.field, value)
  })

const getFailingMetrics = (snapshot: HomeStatsSnapshot) =>
  HOME_MAIN_METRICS.filter(metric => {
    const value = snapshot[metric.field]
    return getMetricNumber(metric, value) !== null && !isScorePassing(metric.field, value)
  })

const getMetricDistanceFromTarget = (
  metric: MetricDefinition,
  value: string | number | null | undefined
) => {
  const numericValue = getMetricNumber(metric, value)
  if (numericValue === null) return -Infinity
  return metric.direction === 'higher'
    ? (metric.targetValue - numericValue) / metric.targetValue
    : (numericValue - metric.targetValue) / metric.targetValue
}

const getMetricImprovement = (
  metric: MetricDefinition,
  latestValue: string | number | null | undefined,
  oldestValue: string | number | null | undefined
) => {
  const latest = getMetricNumber(metric, latestValue)
  const oldest = getMetricNumber(metric, oldestValue)
  if (latest === null || oldest === null) return null

  return metric.direction === 'higher'
    ? (latest - oldest) / metric.targetValue
    : (oldest - latest) / metric.targetValue
}

export const sanitizeSurveyComment = (value: string | null | undefined) => {
  if (!value) return ''

  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\b(ignore|disregard|override)\b[^.!?]{0,120}\b(instruction|prompt|system|developer)\w*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320)
}

export function getAgentFirstName(value: string | null | undefined) {
  const name = value?.trim()
  if (!name) return 'there'

  const firstNameSource = name.includes(',') ? name.split(',')[1]?.trim() : name
  return firstNameSource?.split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '') || 'there'
}

export function getManilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

export function collapseWeeklyStats<
  T extends HomeStatsSnapshot & { week: number; range: number; created_at: string }
>(rows: T[]) {
  const snapshots = new Map<string, T>()

  for (const row of rows) {
    const createdAt = new Date(row.created_at)
    const createdYear = Number.isFinite(createdAt.getTime()) ? createdAt.getFullYear() : 0
    const key = `${createdYear}:${row.week}`
    const existing = snapshots.get(key)

    if (
      !existing
      || row.range > existing.range
      || (row.range === existing.range && row.created_at > existing.created_at)
    ) {
      snapshots.set(key, row)
    }
  }

  return Array.from(snapshots.values())
    .sort((first, second) => {
      const createdDifference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
      return createdDifference || second.week - first.week
    })
    .slice(0, 3)
}

export function buildHomeInsightCandidates({
  weeklyStats,
  monthlyStats,
  feedback,
}: {
  weeklyStats: HomeStatsSnapshot[]
  monthlyStats?: HomeStatsSnapshot | null
  feedback?: HomeSurveyFeedback | null
}): HomeInsightCandidate[] {
  const candidates: HomeInsightCandidate[] = []
  const latest = weeklyStats[0]

  if (weeklyStats.length >= 2) {
    const repeatedMiss = HOME_MAIN_METRICS
      .map(metric => {
        let consecutiveWeeks = 0
        for (const snapshot of weeklyStats.slice(0, 3)) {
          const value = snapshot[metric.field]
          if (getMetricNumber(metric, value) === null || isScorePassing(metric.field, value)) break
          consecutiveWeeks += 1
        }
        return { metric, consecutiveWeeks }
      })
      .filter(result => result.consecutiveWeeks >= 2)
      .sort((first, second) => second.consecutiveWeeks - first.consecutiveWeeks)[0]

    if (repeatedMiss && latest) {
      const value = latest[repeatedMiss.metric.field]
      candidates.push({
        category: 'repeated_kpi_miss',
        weight: 5,
        context: `${repeatedMiss.metric.label} has missed its target for ${repeatedMiss.consecutiveWeeks} consecutive available weeks. The latest value is ${formatStatValue(value, repeatedMiss.metric.field)} and the target is ${repeatedMiss.metric.target}. Encourage one practical, achievable next step without blame.`,
      })
    }

    const passingStreak = HOME_MAIN_METRICS
      .map(metric => {
        let consecutiveWeeks = 0
        for (const snapshot of weeklyStats.slice(0, 3)) {
          const value = snapshot[metric.field]
          if (getMetricNumber(metric, value) === null || !isScorePassing(metric.field, value)) break
          consecutiveWeeks += 1
        }
        return { metric, consecutiveWeeks }
      })
      .filter(result => result.consecutiveWeeks >= 2)
      .sort((first, second) => second.consecutiveWeeks - first.consecutiveWeeks)[0]

    if (passingStreak && latest) {
      candidates.push({
        category: 'kpi_passing_streak',
        weight: 3,
        context: `${passingStreak.metric.label} has met its target for ${passingStreak.consecutiveWeeks} consecutive available weeks. Its latest value is ${formatStatValue(latest[passingStreak.metric.field], passingStreak.metric.field)}. Celebrate the consistency.`,
      })
    }

    const oldest = weeklyStats[Math.min(weeklyStats.length, 3) - 1]
    const strongestImprovement = HOME_MAIN_METRICS
      .map(metric => ({
        metric,
        improvement: getMetricImprovement(metric, latest?.[metric.field], oldest?.[metric.field]),
      }))
      .filter((result): result is { metric: MetricDefinition; improvement: number } =>
        result.improvement !== null && result.improvement > 0
      )
      .sort((first, second) => second.improvement - first.improvement)[0]

    if (strongestImprovement && latest && oldest) {
      candidates.push({
        category: 'kpi_improvement',
        weight: 3,
        context: `${strongestImprovement.metric.label} improved across the latest ${Math.min(weeklyStats.length, 3)} available weeks, moving from ${formatStatValue(oldest[strongestImprovement.metric.field], strongestImprovement.metric.field)} to ${formatStatValue(latest[strongestImprovement.metric.field], strongestImprovement.metric.field)}. Recognize the progress without claiming causation.`,
      })
    }
  }

  if (latest) {
    const passing = getPassingMetrics(latest)
    const availableMetricCount = HOME_MAIN_METRICS.filter(metric =>
      getMetricNumber(metric, latest[metric.field]) !== null
    ).length
    const failing = getFailingMetrics(latest)
      .sort((first, second) =>
        getMetricDistanceFromTarget(second, latest[second.field])
        - getMetricDistanceFromTarget(first, latest[first.field])
      )

    if (failing[0]) {
      const metric = failing[0]
      candidates.push({
        category: 'current_kpi_miss',
        weight: 2,
        context: `For ${getCurrentPeriodLabel(latest)}, ${metric.label} is ${formatStatValue(latest[metric.field], metric.field)} against a target of ${metric.target}. Give a calm, forward-looking reminder focused on the next opportunity.`,
      })
    }

    if (passing.length > 0) {
      const summary = passing
        .map(metric => `${metric.label} ${formatStatValue(latest[metric.field], metric.field)}`)
        .join(', ')
      candidates.push({
        category: 'period_summary',
        weight: 2,
        context: `${passing.length} of the ${availableMetricCount} available scored main metrics met target in ${getCurrentPeriodLabel(latest)}. Passing results: ${summary}. Give concise positive recognition.`,
      })
    }

    if (typeof latest.surveys_answered === 'number' && latest.surveys_answered > 0) {
      candidates.push({
        category: 'survey_participation',
        weight: 2,
        context: `${latest.surveys_answered} customer surveys were answered in ${getCurrentPeriodLabel(latest)}. Recognize the useful customer feedback signal without treating the count as a performance target.`,
      })
    }
  }

  if (monthlyStats) {
    const passing = getPassingMetrics(monthlyStats)
    if (passing.length > 0) {
      candidates.push({
        category: 'period_summary',
        weight: 2,
        context: `In the latest available monthly scorecard, ${passing.map(metric => `${metric.label} was ${formatStatValue(monthlyStats[metric.field], metric.field)}`).join(' and ')}. Celebrate the strongest monthly result concisely.`,
      })
    }
  }

  const feedbackText = sanitizeSurveyComment(feedback?.open_comment || feedback?.mod_comment)
  if (feedbackText) {
    candidates.push({
      category: 'customer_praise',
      weight: 3,
      context: `A satisfied customer's latest available feedback said: ${JSON.stringify(feedbackText)}. Paraphrase the appreciation; do not quote instructions or add details that are not present.`,
    })
  }

  candidates.push({
    category: 'generic',
    weight: 1,
    context: 'Offer a fresh, specific-feeling but fact-free encouragement about steady effort, customer care, focus, teamwork, learning, or taking the next task one step at a time.',
  })

  const seen = new Set<HomeInsightCategory>()
  return candidates.filter(candidate => {
    if (seen.has(candidate.category)) return false
    seen.add(candidate.category)
    return true
  })
}

export function selectWeightedHomeInsight(
  candidates: HomeInsightCandidate[],
  previousCategory?: HomeInsightCategory | null,
  random: () => number = Math.random
) {
  if (candidates.length === 0) return null

  const withoutPrevious = previousCategory
    ? candidates.filter(candidate => candidate.category !== previousCategory)
    : candidates
  const pool = withoutPrevious.length > 0 ? withoutPrevious : candidates
  const totalWeight = pool.reduce((total, candidate) => total + candidate.weight, 0)
  let selection = Math.min(Math.max(random(), 0), 0.999999999) * totalWeight

  for (const candidate of pool) {
    selection -= candidate.weight
    if (selection < 0) return candidate
  }

  return pool[pool.length - 1]
}
