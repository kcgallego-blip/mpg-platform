'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import type {
  AgentInsightAiResult,
  AgentInsightData,
  AgentInsightRosterOption,
  AgentInsightStatSnapshot,
  AgentInsightTrendMetric,
} from '@/lib/agentInsight'
import { canAccessAgentInsight } from '@/lib/agentInsightAccess'
import { getPostLoginRoute } from '@/lib/routes'
import {
  formatStatValue,
  getStatsWeekRangeLabel,
  isScorePassing,
  parsePercentage,
  timeToSeconds,
} from '@/lib/statsUtils'
import { useRequireAuth } from '@/lib/useRequireAuth'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

type ComparisonMode = 'previousWeek' | 'monthly'

const KEY_METRICS = [
  { field: 'csat_score', label: 'CSAT', description: 'Customer Satisfaction', direction: 'higher' as const },
  { field: 'acw', label: 'ACW', description: 'After Call Work', direction: 'lower' as const },
  { field: 'aht', label: 'AHT', description: 'Average Handle Time', direction: 'lower' as const },
  { field: 'surveys_answered', label: 'Surveys', description: 'Surveys Answered', direction: 'neutral' as const },
  { field: 'tph', label: 'TPH', description: 'Tickets Per Hour', direction: 'higher' as const },
] as const

const SUPPORTING_METRICS = [
  { field: 'hold', label: 'Hold' },
  { field: 'nps_score', label: 'NPS' },
  { field: 'mod', label: 'MOD' },
  { field: 'fcr', label: 'FCR' },
  { field: 'calls_touched', label: 'Calls' },
  { field: 'tickets_solved', label: 'Tickets' },
] as const

const TREND_METRICS: Array<{
  field: AgentInsightTrendMetric
  label: string
  target: number
  color: string
}> = [
  { field: 'csat_score', label: 'CSAT (%)', target: 87, color: '#7c3aed' },
  { field: 'acw', label: 'ACW (minutes)', target: 2, color: '#0891b2' },
  { field: 'aht', label: 'AHT (minutes)', target: 9, color: '#ea580c' },
  { field: 'tph', label: 'TPH', target: 6, color: '#16a34a' },
]

const normalizeSearch = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const metricNumber = (field: string, value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null
  if (field === 'acw' || field === 'aht' || field === 'hold' || field === 'talk_time') {
    const seconds = typeof value === 'number' ? value : timeToSeconds(value)
    return seconds === null ? null : seconds
  }
  if (field === 'csat_score' || field === 'mod' || field === 'fcr') {
    const parsed = typeof value === 'number' ? value : parsePercentage(value)
    if (parsed === null || !Number.isFinite(parsed)) return null
    return parsed > 0 && parsed < 1 ? parsed * 100 : parsed
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const trendMetricNumber = (
  field: AgentInsightTrendMetric,
  snapshot: AgentInsightStatSnapshot
) => {
  const numeric = metricNumber(field, snapshot[field])
  if (numeric === null) return null
  return field === 'acw' || field === 'aht' ? Math.round((numeric / 60) * 100) / 100 : numeric
}

const snapshotLabel = (snapshot: AgentInsightStatSnapshot | null, kind: 'week' | 'month') => {
  if (!snapshot) return kind === 'week' ? 'No previous week' : 'No monthly snapshot'
  if (kind === 'month') {
    const month = Number(snapshot.month)
    const created = new Date(snapshot.created_at)
    const uploadMonth = created.getMonth() + 1
    const periodYear = month - uploadMonth > 6 ? created.getFullYear() - 1 : created.getFullYear()
    return Number.isInteger(month) && month >= 1 && month <= 12
      ? new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
          .format(new Date(periodYear, month - 1, 1))
      : 'Latest month'
  }
  return `Week ${snapshot.week}`
}

const weeklyRangeLabel = (snapshot: AgentInsightStatSnapshot | null) => {
  if (!snapshot?.week) return 'No weekly snapshot'
  return getStatsWeekRangeLabel(snapshot.week, snapshot.range || 7, new Date(snapshot.created_at))
}

const getComparisonChange = (
  field: string,
  currentValue: string | number | null | undefined,
  comparisonValue: string | number | null | undefined
) => {
  const current = metricNumber(field, currentValue)
  const comparison = metricNumber(field, comparisonValue)
  if (current === null || comparison === null) return null
  const difference = current - comparison
  if (Math.abs(difference) < 0.005) return 'same' as const
  return difference > 0 ? 'up' as const : 'down' as const
}

const formatDate = (value: string | null) => {
  if (!value) return 'Date unavailable'
  const datePart = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  const date = datePart ? new Date(`${datePart}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function TrendChart({ metric, snapshots }: {
  metric: (typeof TREND_METRICS)[number]
  snapshots: AgentInsightStatSnapshot[]
}) {
  const ordered = [...snapshots].reverse()
  const values = ordered.map((snapshot) => trendMetricNumber(metric.field, snapshot))
  const hasData = values.some((value) => value !== null)

  if (!hasData) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-dim text-sm text-on-surface-variant">
        No {metric.label} trend data
      </div>
    )
  }

  return (
    <div className="h-56">
      <Line
        data={{
          labels: ordered.map((snapshot) => `W${snapshot.week}`),
          datasets: [
            {
              label: metric.label,
              data: values,
              borderColor: metric.color,
              backgroundColor: `${metric.color}22`,
              pointBackgroundColor: metric.color,
              tension: 0.32,
              spanGaps: true,
              fill: true,
            },
            {
              label: 'Target',
              data: ordered.map(() => metric.target),
              borderColor: '#94a3b8',
              borderDash: [6, 5],
              pointRadius: 0,
              borderWidth: 1.5,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: { legend: { labels: { boxWidth: 12, usePointStyle: true } } },
          scales: { y: { beginAtZero: false } },
        }}
      />
    </div>
  )
}

export default function AgentInsightPage() {
  const router = useRouter()
  const { user, isReady } = useRequireAuth()
  const [agents, setAgents] = useState<AgentInsightRosterOption[]>([])
  const [query, setQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeOption, setActiveOption] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState<AgentInsightRosterOption | null>(null)
  const [data, setData] = useState<AgentInsightData | null>(null)
  const [aiInsight, setAiInsight] = useState<AgentInsightAiResult | null>(null)
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previousWeek')
  const [isRosterLoading, setIsRosterLoading] = useState(true)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [dataError, setDataError] = useState('')
  const [aiError, setAiError] = useState('')
  const dataAbortRef = useRef<AbortController | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)

  const allowed = canAccessAgentInsight(user?.role)
  const filteredAgents = useMemo(() => {
    const normalized = normalizeSearch(query)
    if (!normalized) return agents.slice(0, 12)
    const tokens = normalized.split(/\s+/)
    return agents.filter((agent) => {
      const haystack = normalizeSearch(`${agent.name} ${agent.teamLeader || ''} ${agent.role || ''}`)
      return tokens.every((token) => haystack.includes(token))
    }).slice(0, 12)
  }, [agents, query])

  const loadAi = useCallback(async (agentName: string) => {
    aiAbortRef.current?.abort()
    const controller = new AbortController()
    aiAbortRef.current = controller
    setIsAiLoading(true)
    setAiError('')
    setAiInsight(null)

    try {
      const response = await fetch('/api/agent-insight/ai', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName }),
      })
      const payload = await response.json().catch(() => ({})) as { insight?: AgentInsightAiResult; error?: string }
      if (response.status === 401) return router.replace('/login')
      if (response.status === 403) return router.replace(getPostLoginRoute(user?.role))
      if (!response.ok || !payload.insight) throw new Error(payload.error || 'AI coaching insight is unavailable')
      if (!controller.signal.aborted) setAiInsight(payload.insight)
    } catch (error) {
      if (!controller.signal.aborted) {
        setAiError(error instanceof Error ? error.message : 'AI coaching insight is unavailable')
      }
    } finally {
      if (!controller.signal.aborted) setIsAiLoading(false)
    }
  }, [router, user?.role])

  const loadAgentData = useCallback(async (agent: AgentInsightRosterOption) => {
    dataAbortRef.current?.abort()
    aiAbortRef.current?.abort()
    const controller = new AbortController()
    dataAbortRef.current = controller
    setSelectedAgent(agent)
    setData(null)
    setAiInsight(null)
    setDataError('')
    setAiError('')
    setComparisonMode('previousWeek')
    setIsDataLoading(true)
    setIsAiLoading(false)

    try {
      const params = new URLSearchParams({ agentName: agent.name })
      const response = await fetch(`/api/agent-insight?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({})) as AgentInsightData & { error?: string }
      if (response.status === 401) return router.replace('/login')
      if (response.status === 403) return router.replace(getPostLoginRoute(user?.role))
      if (!response.ok) throw new Error(payload.error || 'Unable to load this agent')
      if (!controller.signal.aborted) {
        setData(payload)
        void loadAi(agent.name)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDataError(error instanceof Error ? error.message : 'Unable to load this agent')
      }
    } finally {
      if (!controller.signal.aborted) setIsDataLoading(false)
    }
  }, [loadAi, router, user?.role])

  useEffect(() => {
    if (!isReady || !user) return
    if (!allowed) {
      router.replace(getPostLoginRoute(user.role))
      return
    }

    const controller = new AbortController()
    const loadRoster = async () => {
      try {
        setIsRosterLoading(true)
        setRosterError('')
        const response = await fetch('/api/agent-insight/agents', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({})) as { agents?: AgentInsightRosterOption[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load the agent roster')
        setAgents(payload.agents || [])
      } catch (error) {
        if (!controller.signal.aborted) {
          setRosterError(error instanceof Error ? error.message : 'Unable to load the agent roster')
        }
      } finally {
        if (!controller.signal.aborted) setIsRosterLoading(false)
      }
    }
    void loadRoster()
    return () => controller.abort()
  }, [allowed, isReady, router, user?.email, user?.role])

  useEffect(() => () => {
    dataAbortRef.current?.abort()
    aiAbortRef.current?.abort()
  }, [])

  const currentSnapshot = comparisonMode === 'monthly' ? data?.stats.monthly : data?.stats.current
  const comparison = comparisonMode === 'monthly' ? data?.stats.previousMonth : data?.stats.previousWeek
  const productivityDays = useMemo(
    () => data?.productivity.days.filter((day) => day.tickets !== null) || [],
    [data]
  )
  const productivityLabels = useMemo(
    () => productivityDays.map((day) => {
      const label = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
        .format(new Date(`${day.shiftDate}T00:00:00`))
      return day.isCurrentShift ? `${label}*` : label
    }),
    [productivityDays]
  )
  const productivityTicketsData = useMemo(() => ({
    labels: productivityLabels,
    datasets: [{
      label: 'Tickets',
      data: productivityDays.map((day) => day.tickets),
      backgroundColor: 'rgba(124, 58, 237, 0.55)',
      borderColor: '#7c3aed',
      borderWidth: 1,
      borderRadius: 5,
    }],
  }), [productivityDays, productivityLabels])
  const productivityTphData = useMemo(() => ({
    labels: productivityLabels,
    datasets: [{
      label: 'TPH',
      data: productivityDays.map((day) => day.tph),
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22, 163, 74, 0.12)',
      pointBackgroundColor: '#16a34a',
      pointRadius: 4,
      tension: 0.28,
      fill: true,
    }],
  }), [productivityDays, productivityLabels])

  if (!isReady || !user || !allowed) {
    return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-primary-container" size={40} /></div>
  }

  const chooseAgent = (agent: AgentInsightRosterOption) => {
    setQuery(agent.name)
    setIsDropdownOpen(false)
    setActiveOption(0)
    void loadAgentData(agent)
  }

  return (
    <div className="space-y-6 pb-10">
      <header>
        <p className="text-label-md font-semibold uppercase tracking-wide text-primary-container">Coaching</p>
        <h1 className="font-hanken text-headline-lg font-bold text-on-surface">Agent Insight</h1>
        <p className="mt-2 max-w-3xl text-on-surface-variant">
          Bring performance, customer feedback, productivity, and grounded coaching guidance into one view.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm">
        <label htmlFor="agentInsightSearch" className="mb-2 block text-sm font-semibold text-on-surface">
          Search roster agent
        </label>
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={19} />
          {isRosterLoading ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary-container" size={18} />
          ) : (
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
          )}
          <input
            id="agentInsightSearch"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isDropdownOpen}
            aria-controls="agentInsightOptions"
            aria-activedescendant={isDropdownOpen && filteredAgents[activeOption] ? `agent-option-${activeOption}` : undefined}
            value={query}
            disabled={isRosterLoading}
            placeholder="Type an agent name..."
            autoComplete="off"
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => window.setTimeout(() => setIsDropdownOpen(false), 120)}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsDropdownOpen(true)
              setActiveOption(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIsDropdownOpen(true)
                setActiveOption((index) => Math.min(filteredAgents.length - 1, index + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveOption((index) => Math.max(0, index - 1))
              } else if (event.key === 'Enter' && isDropdownOpen && filteredAgents[activeOption]) {
                event.preventDefault()
                chooseAgent(filteredAgents[activeOption])
              } else if (event.key === 'Escape') {
                setIsDropdownOpen(false)
              }
            }}
            className="w-full rounded-xl border border-outline bg-surface py-3 pl-11 pr-10 text-on-surface outline-none transition placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          {isDropdownOpen && !isRosterLoading && (
            <div id="agentInsightOptions" role="listbox" className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-outline-variant bg-surface p-2 shadow-xl">
              {filteredAgents.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-on-surface-variant">No roster agents match this search.</p>
              ) : filteredAgents.map((agent, index) => (
                <button
                  id={`agent-option-${index}`}
                  role="option"
                  aria-selected={selectedAgent?.name === agent.name}
                  key={agent.name}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseAgent(agent)}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left transition ${index === activeOption ? 'bg-primary-container/15' : 'hover:bg-surface-dim'}`}
                >
                  <span>
                    <span className="block font-semibold text-on-surface">{agent.name}</span>
                    <span className="mt-0.5 block text-xs text-on-surface-variant">{agent.role || 'Role unavailable'} · {agent.teamLeader || 'No team leader'}</span>
                  </span>
                  {!agent.email && <span className="rounded-full bg-warning-container px-2 py-1 text-[11px] font-semibold text-on-warning-container">No email</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {rosterError && <p className="mt-3 text-sm text-error">{rosterError}</p>}
      </section>

      {!selectedAgent && !isRosterLoading && !rosterError && (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface/70 px-6 text-center">
          <UserRound size={42} className="mb-4 text-primary-container/60" />
          <h2 className="font-hanken text-xl font-bold text-on-surface">Choose an agent to begin</h2>
          <p className="mt-2 max-w-lg text-sm text-on-surface-variant">The dashboard will load only after a roster agent is selected.</p>
        </section>
      )}

      {isDataLoading && (
        <section className="flex min-h-72 items-center justify-center rounded-2xl border border-outline-variant bg-surface">
          <div className="text-center"><Loader2 size={40} className="mx-auto mb-3 animate-spin text-primary-container" /><p className="text-on-surface-variant">Building {selectedAgent?.name}&apos;s coaching view...</p></div>
        </section>
      )}

      {dataError && (
        <section className="flex gap-3 rounded-xl border border-error/30 bg-error-container/40 p-4 text-on-error-container">
          <AlertCircle size={21} className="mt-0.5 flex-none" /><div><p className="font-semibold">Agent data could not be loaded</p><p className="mt-1 text-sm">{dataError}</p></div>
        </section>
      )}

      {data && !isDataLoading && (
        <>
          <section className="overflow-hidden rounded-2xl border border-primary-container/20 bg-gradient-to-r from-primary-container/15 via-surface to-inverse-primary/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container"><UserRound size={28} /></div>
                <div><h2 className="font-hanken text-2xl font-bold text-on-surface">{data.agent.name}</h2><p className="text-sm text-on-surface-variant">{data.agent.role || 'Role unavailable'} · {data.agent.teamLeader ? `Team ${data.agent.teamLeader}` : 'No team leader assigned'}</p></div>
              </div>
              <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${comparisonMode === 'monthly' ? 'bg-primary-container text-on-primary-container' : data.stats.isCurrentWeek ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container'}`}>
                {comparisonMode === 'monthly' ? 'Monthly view' : data.stats.isCurrentWeek ? 'Current week' : 'Latest available'}
              </div>
            </div>
            {data.warnings.length > 0 && (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {data.warnings.map((warning) => <div key={warning} className="flex gap-2 rounded-lg border border-warning/20 bg-warning-container/45 px-3 py-2 text-xs text-on-warning-container"><AlertCircle size={15} className="mt-0.5 flex-none" />{warning}</div>)}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-container">Performance snapshot</p><h2 className="mt-1 font-hanken text-2xl font-bold text-on-surface">{currentSnapshot ? snapshotLabel(currentSnapshot, comparisonMode === 'monthly' ? 'month' : 'week') : comparisonMode === 'monthly' ? 'No monthly Stats' : 'No weekly Stats'}</h2><p className="mt-1 text-sm text-on-surface-variant">{comparisonMode === 'monthly' ? 'Monthly scorecard' : weeklyRangeLabel(currentSnapshot || null)}</p></div>
              <div>
                <p className="mb-2 text-xs font-semibold text-on-surface-variant">View performance by</p>
                <div className="inline-flex rounded-full border border-outline-variant bg-surface-dim p-1">
                  <button type="button" onClick={() => setComparisonMode('previousWeek')} className={`rounded-full px-4 py-2 text-sm font-semibold ${comparisonMode === 'previousWeek' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}>Weekly</button>
                  <button type="button" onClick={() => setComparisonMode('monthly')} className={`rounded-full px-4 py-2 text-sm font-semibold ${comparisonMode === 'monthly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}>Monthly</button>
                </div>
                <p className="mt-2 text-right text-xs text-on-surface-variant">Comparison period: {snapshotLabel(comparison || null, comparisonMode === 'monthly' ? 'month' : 'week')}</p>
              </div>
            </div>

            {currentSnapshot ? (
              <>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {KEY_METRICS.map((metric) => {
                    const currentValue = currentSnapshot[metric.field]
                    const comparisonValue = comparison?.[metric.field]
                    const change = getComparisonChange(metric.field, currentValue, comparisonValue)
                    const hasTarget = metric.direction !== 'neutral'
                    const passing = hasTarget && isScorePassing(metric.field, currentValue)
                    return (
                      <article key={metric.field} className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4">
                        <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-on-surface">{metric.label}</p><p className="mt-0.5 text-xs text-on-surface-variant">{metric.description}</p></div>{hasTarget && <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${passing ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>{passing ? 'On target' : 'Below target'}</span>}</div>
                        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-primary-container">Current</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-on-surface">{formatStatValue(currentValue, metric.field)}</p>
                            <p className="mt-1 text-xs text-on-surface-variant">{snapshotLabel(currentSnapshot, comparisonMode === 'monthly' ? 'month' : 'week')}</p>
                          </div>
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${change === 'up' ? 'bg-success-container text-success' : change === 'down' ? 'bg-error-container text-error' : 'bg-surface-container-high text-on-surface-variant'}`}
                            title={change === 'up' ? 'Increased from comparison period' : change === 'down' ? 'Decreased from comparison period' : change === 'same' ? 'No change from comparison period' : 'Comparison unavailable'}
                          >
                            {change === 'up' ? <ArrowUp size={19} aria-label="Increased" /> : change === 'down' ? <ArrowDown size={19} aria-label="Decreased" /> : <Minus size={19} aria-label={change === 'same' ? 'No change' : 'Comparison unavailable'} />}
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Comparison</p>
                            <p className="mt-1 text-2xl font-black tracking-tight text-on-surface">{formatStatValue(comparisonValue, metric.field)}</p>
                            <p className="mt-1 truncate text-xs text-on-surface-variant" title={snapshotLabel(comparison || null, comparisonMode === 'monthly' ? 'month' : 'week')}>{snapshotLabel(comparison || null, comparisonMode === 'monthly' ? 'month' : 'week')}</p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {SUPPORTING_METRICS.map((metric) => <div key={metric.field} className="rounded-lg border border-outline-variant/50 bg-surface-dim p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">{metric.label}</p><p className="mt-2 text-lg font-bold text-on-surface">{formatStatValue(currentSnapshot[metric.field], metric.field)}</p></div>)}
                </div>
              </>
            ) : <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-surface-dim p-10 text-center text-on-surface-variant">No matched {comparisonMode === 'monthly' ? 'monthly' : 'weekly'} scorecard is available.</div>}
          </section>

          <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><TrendingUp className="text-primary-container" size={23} /><div><h2 className="font-hanken text-xl font-bold text-on-surface">Four-week KPI trends</h2><p className="text-sm text-on-surface-variant">Distinct available snapshots with target reference lines.</p></div></div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {TREND_METRICS.map((metric) => <article key={metric.field} className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-4"><h3 className="mb-3 text-sm font-bold text-on-surface">{metric.label}</h3><TrendChart metric={metric} snapshots={data.stats.trend} /></article>)}
            </div>
          </section>

          <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><AlertCircle className="text-error" size={23} /><div><h2 className="font-hanken text-xl font-bold text-on-surface">Customer friction signals</h2><p className="text-sm text-on-surface-variant">Up to 12 Neutral and Unsatisfied comments from the last six weeks.</p></div></div>
            {data.surveys.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-surface-dim p-10 text-center text-on-surface-variant">No recent Neutral or Unsatisfied comments with text were found.</div> : (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {(['Unsatisfied', 'Neutral'] as const).map((sentiment) => {
                  const rows = data.surveys.filter((survey) => survey.sentiment === sentiment)
                  return <div key={sentiment} className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold text-on-surface">{sentiment}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${sentiment === 'Unsatisfied' ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container'}`}>{rows.length}</span></div>{rows.length === 0 ? <div className="rounded-lg border border-dashed border-outline-variant p-5 text-sm text-on-surface-variant">No {sentiment.toLowerCase()} comments.</div> : rows.map((survey) => <article key={`${survey.responseId}-${survey.surveyDate}`} className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4"><p className="text-xs font-semibold text-on-surface-variant">{formatDate(survey.surveyDate)}</p>{survey.modComment && <div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">MOD comment</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-on-surface">{survey.modComment}</p></div>}{survey.openComment && <div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Open comment</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-on-surface">{survey.openComment}</p></div>}</article>)}</div>
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><BarChart3 className="text-primary-container" size={23} /><div><h2 className="font-hanken text-xl font-bold text-on-surface">Two-week productivity</h2><p className="text-sm text-on-surface-variant">Only shift dates with recorded productivity are shown from the last 14 Manila shift dates. * Current partial shift.</p></div></div>
            {productivityDays.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-surface-dim p-10 text-center text-on-surface-variant">No matched productivity snapshots are available.</div> : <><div className="mt-6 grid gap-5 lg:grid-cols-2"><article className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-4"><div className="mb-4"><h3 className="font-bold text-on-surface">Tickets handled</h3><p className="text-xs text-on-surface-variant">Daily recorded volume</p></div><div className="h-72"><Bar data={productivityTicketsData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Tickets' } } } }} /></div></article><article className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-4"><div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-bold text-on-surface">Tickets per hour</h3><p className="text-xs text-on-surface-variant">Daily productivity rate</p></div><span className="rounded-full bg-success-container px-2.5 py-1 text-[11px] font-bold text-on-success-container">Target 6+</span></div><div className="h-72"><Line data={productivityTphData} options={{ responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'TPH' } } } }} /></div></article></div><div className="mt-5 flex flex-wrap gap-2">{Object.entries(data.productivity.statusTotals).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => <span key={status} className="rounded-full border border-outline-variant bg-surface-dim px-3 py-1.5 text-xs font-semibold text-on-surface">{status}: {count}</span>)}</div></>}
          </section>

          <section aria-live="polite" aria-busy={isAiLoading} className="relative overflow-hidden rounded-2xl border border-primary-container/25 bg-gradient-to-br from-primary-container/15 via-surface to-inverse-primary/10 p-5 shadow-lg sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-container/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container text-on-primary-container"><Sparkles size={22} /></div><div><h2 className="font-hanken text-xl font-bold text-on-surface">AI coaching insight</h2><p className="text-sm text-on-surface-variant">Grounded in the evidence shown above.</p></div></div><button type="button" disabled={isAiLoading} onClick={() => void loadAi(data.agent.name)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface-dim disabled:opacity-50"><RefreshCw size={16} className={isAiLoading ? 'animate-spin' : ''} />{aiInsight ? 'Regenerate' : 'Retry'}</button></div>
            {isAiLoading ? <div className="relative mt-7 space-y-3"><div className="h-5 w-full animate-pulse rounded bg-surface-container-high" /><div className="h-5 w-4/5 animate-pulse rounded bg-surface-container-high" /><p className="pt-2 text-sm text-on-surface-variant">Reviewing trends and coaching signals...</p></div> : aiError ? <div className="relative mt-6 flex gap-3 rounded-xl border border-error/30 bg-error-container/40 p-4 text-on-error-container"><AlertCircle size={20} className="mt-0.5 flex-none" /><div><p className="font-semibold">AI insight is temporarily unavailable</p><p className="mt-1 text-sm">{aiError}</p></div></div> : aiInsight ? <div className="relative mt-6 space-y-5"><p className="rounded-xl border border-primary-container/20 bg-surface/80 p-4 leading-7 text-on-surface">{aiInsight.summary}</p><div className="grid gap-5 lg:grid-cols-2"><div><div className="mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-success" /><h3 className="font-bold text-on-surface">Strengths</h3></div><div className="space-y-3">{aiInsight.strengths.length === 0 ? <p className="rounded-lg border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">Not enough evidence to identify a reliable strength.</p> : aiInsight.strengths.map((item) => <article key={`${item.title}-${item.evidence}`} className="rounded-xl border border-success/20 bg-success-container/35 p-4"><p className="font-bold text-on-success-container">{item.title}</p><p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.evidence}</p></article>)}</div></div><div><div className="mb-3 flex items-center gap-2"><Target size={18} className="text-warning" /><h3 className="font-bold text-on-surface">Improvement priorities</h3></div><div className="space-y-3">{aiInsight.improvementPriorities.length === 0 ? <p className="rounded-lg border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">Not enough evidence to identify a reliable priority.</p> : aiInsight.improvementPriorities.map((item) => <article key={`${item.title}-${item.evidence}`} className="rounded-xl border border-warning/20 bg-warning-container/35 p-4"><p className="font-bold text-on-warning-container">{item.title}</p><p className="mt-1 text-sm leading-6 text-on-surface-variant">{item.evidence}</p></article>)}</div></div></div><div><div className="mb-3 flex items-center gap-2"><Lightbulb size={18} className="text-primary-container" /><h3 className="font-bold text-on-surface">Suggested action plan</h3></div><ol className="grid gap-3 md:grid-cols-3">{aiInsight.actionPlan.map((action, index) => <li key={`${index}-${action}`} className="rounded-xl border border-primary-container/20 bg-surface/80 p-4 text-sm leading-6 text-on-surface"><span className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-xs font-black text-on-primary-container">{index + 1}</span>{action}</li>)}</ol></div><p className="text-right text-[11px] text-on-surface-variant">Generated {formatDate(aiInsight.generatedAt)} · Verify recommendations before using them in coaching.</p></div> : null}
          </section>
        </>
      )}
    </div>
  )
}
