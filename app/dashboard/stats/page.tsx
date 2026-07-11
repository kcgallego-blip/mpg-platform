'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Search,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Upload,
} from 'lucide-react'
import {
  getStatsMonthOptions,
  getStatsPeriodLabel,
  getStatsWeekNumber,
  getStatsWeekRange,
  getStatsWeekRangeLabel,
  isScorePassing,
  isNAField,
  formatStatValue,
} from '@/lib/statsUtils'

type Stat = {
  id: string
  supervisor: string
  name: string
  acw: string | null
  aht: string | null
  hold: string | null
  talk_time: string | null
  csat_score: string | null
  dsat: string | null
  nps_score: number | null
  promoter: number | null
  mod: string | null
  mod_value: number | null
  fcr: string | null
  fcr_value: number | null
  surveys_answered: number | null
  calls_touched: number | null
  tickets_solved: number | null
  transactions: number | null
  productive_hours: string | null
  tph: number | null
  week: number
  range: number
  created_at: string
}

type SortConfig = {
  field: string
  order: 'asc' | 'desc'
}

const DISPLAY_COLUMNS = [
  'name',
  'supervisor',
  'acw',
  'aht',
  'hold',
  'talk_time',
  'csat_score',
  'dsat',
  'nps_score',
  'mod',
  'mod_value',
  'fcr',
  'fcr_value',
  'surveys_answered',
  'tph',
  'calls_touched',
  'tickets_solved',
]

const SCORECARD_METRICS = [
  { field: 'acw', label: 'ACW', description: 'After Call Work' },
  { field: 'aht', label: 'AHT', description: 'Average Handle Time' },
  { field: 'hold', label: 'Hold', description: 'Hold Time' },
  { field: 'talk_time', label: 'Talk Time', description: 'Total Talk Time' },
  { field: 'csat_score', label: 'CSAT', description: 'Customer Satisfaction' },
  { field: 'dsat', label: 'DSAT', description: 'Customer Dissatisfaction' },
  { field: 'nps_score', label: 'NPS', description: 'Net Promoter Score' },
  { field: 'promoter', label: 'NPS Promoters', description: 'NPS Promoters Count' },
  { field: 'mod', label: 'MOD', description: 'Moment of Delight' },
  { field: 'mod_value', label: 'MOD Count', description: 'Moment of Delight Count' },
  { field: 'fcr', label: 'FCR', description: 'First Contact Resolution' },
  { field: 'fcr_value', label: 'FCR Count', description: 'First Contact Resolution Count' },
  { field: 'surveys_answered', label: 'Surveys Answered', description: 'Total surveys answered' },
  { field: 'tph', label: 'TPH', description: 'Tickets Per Hour' },
]

const PRIMARY_METRICS = ['csat_score', 'acw', 'aht', 'surveys_answered', 'tph']
const SECONDARY_METRICS = ['nps_score', 'mod', 'fcr']

const SCORECARD_METRIC_TIERS = [
  {
    title: 'Key Metrics',
    style: 'primary' as const,
    fields: PRIMARY_METRICS,
  },
  {
    title: 'Secondary Metrics',
    style: 'secondary' as const,
    fields: SECONDARY_METRICS,
  },
  {
    title: 'Basic Metrics',
    style: 'basic' as const,
    fields: SCORECARD_METRICS.map(metric => metric.field).filter(field =>
      !PRIMARY_METRICS.includes(field) && !SECONDARY_METRICS.includes(field)
    ),
  },
]

const COLUMN_LABELS: Record<string, string> = {
  name: 'Agent Name',
  supervisor: 'Team Leader',
  acw: 'ACW',
  aht: 'AHT',
  hold: 'Hold',
  talk_time: 'Talk Time',
  csat_score: 'CSAT',
  dsat: 'DSAT',
  nps_score: 'NPS',
  promoter: 'Promoter',
  mod: 'MOD',
  mod_value: 'MOD Count',
  fcr: 'FCR',
  fcr_value: 'FCR Count',
  surveys_answered: 'Surveys Answered',
  calls_touched: 'Calls',
  tickets_solved: 'Tickets',
  transactions: 'Transactions',
  productive_hours: 'Prod Hours',
  tph: 'TPH',
}

export default function StatsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSupervisor, setSelectedSupervisor] = useState('all')
  const [supervisors, setSupervisors] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'name', order: 'asc' })
  const [userRole, setUserRole] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(() => getStatsWeekNumber())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly')
  const [displayedRange, setDisplayedRange] = useState(() => getStatsWeekRange())

  const displayedDateRange = useMemo(
    () => getStatsPeriodLabel(periodType, periodType === 'monthly' ? selectedMonth : selectedWeek),
    [periodType, selectedMonth, selectedWeek]
  )

  const periodOptions = useMemo(() => {
    if (periodType === 'monthly') {
      return getStatsMonthOptions()
    }

    const currentWeek = getStatsWeekNumber()
    const oldestWeek = 23
    const startWeek = currentWeek >= oldestWeek ? Math.max(oldestWeek, currentWeek - 11) : 1

    return Array.from(
      { length: currentWeek - startWeek + 1 },
      (_, index) => currentWeek - index
    )
  }, [periodType])

  const loadStats = useCallback(async () => {
    if (!user?.email) {
      setIsLoading(false)
      router.push('/login')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      const queryParams = new URLSearchParams({
        search: searchQuery,
        supervisor: selectedSupervisor,
        sortBy: sortConfig.field,
        sortOrder: sortConfig.order,
        periodType,
        period: String(periodType === 'monthly' ? selectedMonth : selectedWeek),
      })

      const response = await fetch(`/api/stats?${queryParams}`)

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        throw new Error('Failed to fetch stats')
      }

      const data = await response.json()
      setStats(data.stats || [])
      setSupervisors(data.supervisors || [])
      setDisplayedRange(data.range || getStatsWeekRange())
      setUserRole(data.userRole)
      if (data.periodType) {
        setPeriodType(data.periodType)
      }
      if (data.periodValue && data.periodType === 'monthly') {
        setSelectedMonth(Number(data.periodValue))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load stats')
      console.error('Stats error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user?.email, searchQuery, selectedSupervisor, sortConfig, periodType, selectedMonth, selectedWeek, router])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleSort = (field: string) => {
    setSortConfig(prevConfig => ({
      field,
      order: prevConfig.field === field && prevConfig.order === 'asc' ? 'desc' : 'asc',
    }))
  }

  const getScoreColor = (fieldName: string, value: string | number | null | undefined) => {
    if (isNAField(fieldName)) return ''
    if (isScorePassing(fieldName, value)) return 'bg-emerald-100 text-emerald-800 border border-emerald-300'
    return ''
  }

  const renderCell = (fieldName: string, value: string | number | null | undefined) => {
    const formattedValue = formatStatValue(value, fieldName)
    if (!formattedValue) {
      return <td key={`${fieldName}-${value}`} className="whitespace-nowrap px-4 py-3 text-sm" />
    }

    const isNA = isNAField(fieldName)
    const passing = !isNA && isScorePassing(fieldName, value)
    const colorClass = getScoreColor(fieldName, value)

    return (
      <td
        key={`${fieldName}-${value}`}
        className="whitespace-nowrap px-4 py-3 text-sm"
      >
        {isNA ? (
          <span className="text-on-surface-variant">—</span>
        ) : passing ? (
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 font-semibold ${colorClass}`}>
            {formattedValue}
          </span>
        ) : (
          <span className="text-on-surface">{formattedValue}</span>
        )}
      </td>
    )
  }

  const getScorecardStatus = (fieldName: string, value: string | number | null | undefined) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value
    if (fieldName === 'tph' && (value === null || value === undefined || value === '' || normalizedValue === '–' || normalizedValue === '-' || normalizedValue === '—' || normalizedValue === 'Not available')) {
      return { label: 'Not available yet', className: 'bg-surface-container text-on-surface-variant border border-outline-variant' }
    }
    if (isNAField(fieldName)) return { label: 'N/A', className: 'bg-surface-container text-on-surface-variant border border-outline-variant' }
    if (isScorePassing(fieldName, value)) return { label: 'Passing', className: 'bg-green-100 text-green-700 border border-green-200' }
    return { label: 'Below Target', className: 'bg-red-50 text-red-700 border border-red-200' }
  }

  const formatAgentMetricValue = (fieldName: string, value: string | number | null | undefined) => {
    const formattedValue = formatStatValue(value, fieldName)
    if (fieldName === 'tph' && formattedValue !== 'Not available') {
      const numericValue = Number(formattedValue)
      if (Number.isFinite(numericValue)) return String(Math.round(numericValue))
    }
    return formattedValue
  }

  const formatScorecardDate = (date: string) => {
    try {
      return new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(date))
    } catch {
      return ''
    }
  }

  const renderHeader = (field: string) => {
    const isActive = sortConfig.field === field
    const label = COLUMN_LABELS[field] || field

    return (
      <th
        key={field}
        onClick={() => handleSort(field)}
        className="cursor-pointer px-4 py-3 text-left font-semibold text-on-surface hover:bg-surface-dim transition-colors"
      >
        <div className="flex items-center gap-2 whitespace-nowrap">
          {label}
          {isActive && (
            sortConfig.order === 'asc' ? (
              <ChevronUp size={16} className="text-primary" />
            ) : (
              <ChevronDown size={16} className="text-primary" />
            )
          )}
        </div>
      </th>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="mx-auto mb-4 animate-spin text-primary-container" />
          <p className="text-on-surface-variant">Loading stats...</p>
        </div>
      </div>
    )
  }

  const latestAgentStat = stats[0]!
  const periodLabel = periodType === 'monthly'
    ? new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(new Date().getFullYear(), selectedMonth - 1, 1))
    : `Week ${selectedWeek}`

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-label-md font-semibold uppercase text-primary-container">Stats</p>
          <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
            {userRole?.toLowerCase() === 'agent' ? 'Your Performance' : 'Team Performance'}
          </h1>
          <p className="mt-2 max-w-3xl text-on-surface-variant">
            {userRole?.toLowerCase() === 'agent'
              ? 'View your performance metrics and KPIs.'
              : 'View and manage agent performance metrics. Green chips indicate passing scores.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-full border border-outline-variant bg-surface p-1">
            <button
              type="button"
              onClick={() => setPeriodType('weekly')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'weekly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setPeriodType('monthly')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${periodType === 'monthly' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant'}`}
            >
              Monthly
            </button>
          </div>
          {(userRole?.toLowerCase() === 'team leader' ||
            userRole?.toLowerCase() === 'supervisor' ||
            userRole?.toLowerCase() === 'admin' ||
            userRole?.toLowerCase() === 'manager') && (
            <button
              onClick={() => router.push('/dashboard/stats/upload')}
              className="flex items-center gap-2 rounded-lg bg-primary-container px-6 py-2.5 font-medium text-on-primary-container transition hover:opacity-90 whitespace-nowrap"
            >
              <Upload size={18} />
              Upload Stats
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex gap-3 rounded-lg border border-error/30 bg-error/10 p-4">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-error" />
          <div>
            <p className="font-medium text-error">Error</p>
            <p className="text-sm text-error/80">{error}</p>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      {userRole?.toLowerCase() !== 'agent' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {/* Search */}
            <div className="flex-1">
              <label htmlFor="search" className="mb-2 block text-sm font-medium text-on-surface">
                Search Agent
              </label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  id="search"
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-outline bg-surface pl-10 pr-4 py-2.5 text-on-surface placeholder-on-surface-variant outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Supervisor Filter */}
            {supervisors.length > 0 && (
              <div className="flex-1 lg:max-w-xs">
                <label htmlFor="supervisor" className="mb-2 block text-sm font-medium text-on-surface">
                  Team Leader
                </label>
                <select
                  id="supervisor"
                  value={selectedSupervisor}
                  onChange={e => setSelectedSupervisor(e.target.value)}
                  className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Team Leaders</option>
                  {supervisors.map(supervisor => (
                    <option key={supervisor} value={supervisor}>
                      {supervisor}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {userRole?.toLowerCase() !== 'agent' && (
        <div className="rounded-lg border border-outline-variant/60 bg-surface-dim p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="statsPeriod" className="mb-2 block text-sm font-medium text-on-surface">
                {periodType === 'monthly' ? 'Month' : 'Week'}
              </label>
              {periodType === 'monthly' ? (
                <select
                  id="statsPeriod"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {periodOptions.map(month => (
                    <option key={month} value={month}>
                      {new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date(new Date().getFullYear(), month - 1, 1))}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="statsPeriod"
                  type="number"
                  min="1"
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(Number(e.target.value))}
                  className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                />
              )}
            </div>

            <div>
              <p className="mb-2 block text-sm font-medium text-on-surface">Showing Range</p>
              <div className="rounded-lg bg-surface px-4 py-2.5 text-on-surface">
                {periodType === 'monthly' ? periodLabel : `Week ${selectedWeek}`} • {displayedDateRange}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">
            {periodType === 'monthly'
              ? 'Monthly imports use the selected month and follow the same CSV format as weekly uploads.'
              : 'Weeks start on Sunday. The range shown is based on the latest available stats for the selected week.'}
          </p>
        </div>
      )}

      {userRole?.toLowerCase() === 'agent' && !isLoading && (
        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-label-md font-semibold uppercase text-primary-container">
                Viewing Week
              </p>
              <h2 className="mt-1 font-hanken text-headline-md font-bold text-on-surface">
                Week {selectedWeek}
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {displayedDateRange}
              </p>
            </div>

            <div className="w-full md:w-64">
              <label htmlFor="agentStatsPeriod" className="mb-2 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {periodType === 'monthly' ? 'Month' : 'Week'}
              </label>
              {periodType === 'monthly' ? (
                <select
                  id="agentStatsPeriod"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-outline bg-surface px-3 py-2.5 text-sm font-semibold text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {periodOptions.map(month => (
                    <option key={month} value={month}>
                      {new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date(new Date().getFullYear(), month - 1, 1))}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  id="agentStatsPeriod"
                  value={selectedWeek}
                  onChange={e => setSelectedWeek(Number(e.target.value))}
                  className="w-full rounded-lg border border-outline bg-surface px-3 py-2.5 text-sm font-semibold text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {periodOptions.map(week => (
                    <option key={week} value={week}>
                      Week {week}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Table */}
      {userRole?.toLowerCase() === 'agent' ? (
        stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70 py-16">
            <AlertCircle size={40} className="mb-4 text-on-surface-variant/40" />
            <p className="text-on-surface-variant">No scorecard available for {periodType === 'monthly' ? 'the selected month' : `Week ${selectedWeek}`} ({displayedDateRange}).</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-label-md font-semibold uppercase text-primary-container">
                  Agent Scorecard
                </p>
                <h2 className="mt-1 font-hanken text-headline-md font-bold text-on-surface">
                  {latestAgentStat.name}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {latestAgentStat.supervisor ? `Team Leader: ${latestAgentStat.supervisor}` : 'Performance metrics'}
                </p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {periodType === 'monthly'
                    ? `${new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(new Date().getFullYear(), selectedMonth - 1, 1))}`
                    : `Week ${latestAgentStat.week} • ${getStatsWeekRangeLabel(latestAgentStat.week, latestAgentStat.range)}`}
                </p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                  Latest Update
                </p>
                <p className="mt-1 text-sm font-semibold text-on-surface">
                  {formatScorecardDate(latestAgentStat.created_at)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-8">
              {SCORECARD_METRIC_TIERS.map(tier => {
                const gridClass = tier.style === 'primary'
                  ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5'
                  : tier.style === 'secondary'
                    ? 'grid grid-cols-1 gap-4 sm:grid-cols-3'
                    : 'grid grid-cols-2 gap-3 xl:grid-cols-5'

                return (
                  <section key={tier.title} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-px flex-1 ${tier.style === 'primary' ? 'bg-primary-container/40' : 'bg-outline-variant'}`} />
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                        {tier.title}
                      </h3>
                      <div className={`h-px flex-1 ${tier.style === 'primary' ? 'bg-primary-container/40' : 'bg-outline-variant'}`} />
                    </div>

                    <div className={gridClass}>
                      {tier.fields.map(field => {
                        const metric = SCORECARD_METRICS.find(item => item.field === field)
                        if (!metric) return null

                        const value = latestAgentStat[metric.field as keyof Stat]
                        const formattedValue = formatAgentMetricValue(metric.field, value)
                        if (!formattedValue) return null

                        const status = getScorecardStatus(metric.field, value)
                        if (status.label === 'N/A' && formattedValue === '—') return null

                        if (tier.style === 'primary') {
                          return (
                            <div
                              key={metric.field}
                              className="rounded-2xl border-2 border-primary-container/30 bg-gradient-to-br from-primary-container to-inverse-primary p-5 shadow-lg shadow-primary-container/20"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-on-primary-container">
                                    {metric.label}
                                  </p>
                                  <p className="mt-1 text-xs text-white/80">
                                    {metric.description}
                                  </p>
                                </div>
                                {status.label !== 'N/A' && (
                                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-on-surface">
                                    {status.label}
                                  </span>
                                )}
                              </div>
                              <div className={`mt-5 break-words text-4xl font-black tracking-tight sm:text-5xl ${status.label === 'Below Target' ? 'text-red-200' : 'text-white'}`}>
                                {formattedValue}
                              </div>
                            </div>
                          )
                        }

                        if (tier.style === 'secondary') {
                          return (
                            <div
                              key={metric.field}
                              className="rounded-xl border border-primary-container/20 bg-primary-container/10 p-5"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-primary-container">
                                    {metric.label}
                                  </p>
                                  <p className="mt-1 text-xs text-on-surface-variant">
                                    {metric.description}
                                  </p>
                                </div>
                                {status.label !== 'N/A' && (
                                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>
                                    {status.label}
                                  </span>
                                )}
                              </div>
                              <div className={`mt-4 text-2xl font-bold tracking-tight sm:text-3xl ${status.label === 'Below Target' ? 'text-red-600' : 'text-on-surface'}`}>
                                {formattedValue}
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={metric.field}
                            className="rounded-lg border border-outline-variant/60 bg-surface p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                                  {metric.label}
                                </p>
                              </div>
                              {status.label !== 'N/A' && (
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>
                                  {status.label}
                                </span>
                              )}
                            </div>
                            <div className={`mt-3 text-lg font-semibold ${status.label === 'Below Target' ? 'text-red-600' : 'text-on-surface'}`}>
                              {formattedValue}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )
      ) : stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70 py-16">
          <AlertCircle size={40} className="mb-4 text-on-surface-variant/40" />
          <p className="text-on-surface-variant">
            {searchQuery ? `No agents found matching your search for ${periodType === 'monthly' ? 'the selected month' : `Week ${selectedWeek}`} (${displayedDateRange}).` : `No stats available for ${periodType === 'monthly' ? 'the selected month' : `Week ${selectedWeek}`} (${displayedDateRange}).`}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-lg border border-outline-variant/60 bg-surface-dim p-4 text-sm text-on-surface-variant">
            Showing {periodType === 'monthly' ? 'Month' : 'Week'} {periodType === 'monthly' ? periodLabel : selectedWeek} • {displayedDateRange}
          </div>
          <div className="overflow-x-auto rounded-lg border border-outline-variant/60 bg-surface">
          <table className="w-full border-collapse">
            <thead className="border-b border-outline-variant/60 bg-surface-dim">
              <tr>
                {DISPLAY_COLUMNS.map(field => renderHeader(field))}
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, idx) => (
                <tr
                  key={stat.id}
                  className={`border-b border-outline-variant/30 transition hover:bg-surface-dim ${
                    idx % 2 === 0 ? 'bg-surface' : 'bg-surface/50'
                  }`}
                >
                  {DISPLAY_COLUMNS.map(field => {
                    const value = stat[field as keyof Stat]
                    return renderCell(field, value)
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* Legend */}
      <div className="space-y-2 rounded-lg border border-outline-variant/60 bg-surface-dim p-4">
        <p className="text-sm font-medium text-on-surface">Legend:</p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="inline-block rounded-full bg-green-100 px-3 py-1 text-green-700">
              Passing
            </div>
            <span className="text-sm text-on-surface-variant">Score meets requirements</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-on-surface">Not Passing</div>
            <span className="text-sm text-on-surface-variant">Score below requirements</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-on-surface-variant">—</div>
            <span className="text-sm text-on-surface-variant">Not applicable or no data</span>
          </div>
        </div>
      </div>
    </div>
  )
}
