'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { supabase } from '@/lib/supabase'
import { BarChart3, CalendarDays, Clock3, Gauge, Loader2, RefreshCw, Sigma, Ticket } from 'lucide-react'
import {
  TPH_STATUS_COLUMNS,
  TphDataSource,
  getTphDataSourceForShiftDate,
  parseHourlyTickets,
  parseSummaryTickets,
} from '@/lib/tphProductivity'

type TphTicket = {
  ticket_num: number
  agent: string | null
  status: string | null
  shift_date: string | null
  created_at: string
}

type TphSummaryRow = {
  shift_date: string
  agent: string
  tickets: string | null
  hourly_tickets: string | null
  created_at: string
}

const STATUS_LANES = [
  { key: 'Open', title: 'Open', color: 'border-red-300', header: 'bg-red-50', icon: 'bg-red-100 text-red-700', count: 'bg-red-100 text-red-800' },
  { key: 'Pending', title: 'Pending', color: 'border-blue-300', header: 'bg-blue-50', icon: 'bg-blue-100 text-blue-700', count: 'bg-blue-100 text-blue-800' },
  { key: 'On-Hold', title: 'On-Hold', color: 'border-slate-400', header: 'bg-slate-100', icon: 'bg-slate-200 text-slate-800', count: 'bg-slate-200 text-slate-900' },
  { key: 'Solved', title: 'Solved', color: 'border-gray-300', header: 'bg-gray-50', icon: 'bg-gray-100 text-gray-700', count: 'bg-gray-100 text-gray-800' },
]

const getPhilippineDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)

  return new Date(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
    getPart('second')
  )
}

const getShiftDate = (date: Date) => {
  const phDate = getPhilippineDate(date)
  const shiftDate = new Date(phDate)

  if (phDate.getHours() < 19) {
    shiftDate.setDate(shiftDate.getDate() - 1)
  }

  return shiftDate
}

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const formatSelectedDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

const hourSlots = Array.from({ length: 18 }, (_, index) => {
  const hour = (18 + index) % 24
  const label = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
  }).format(new Date(2026, 0, 1, hour))

  return {
    key: String(hour).padStart(2, '0'),
    label: label.replace(' ', '').toLowerCase(),
  }
})

const getHeatMapColor = (count: number) => {
  if (count === 0) return 'rgba(0,0,0,0)'
  if (count <= 1) return '#ef4444'
  if (count >= 6) return '#16a34a'
  
  const t = (count - 1) / 5
  const r = Math.round(239 - t * 209)
  const g = Math.round(68 + t * 167)
  return `rgb(${r}, ${g}, 68)`
}

const HourlyBarChart = ({
  values,
  maxValue,
}: {
  values: Record<string, number>
  maxValue: number
}) => {
  const safeMax = Math.max(maxValue, 1)
  const [hoveredHour, setHoveredHour] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-outline-variant/60 bg-surface-container/40 p-4">
      <div className="flex h-48 items-end justify-between gap-2">
        {hourSlots.map((hour) => {
          const count = values[hour.key] || 0
          const heightPercent = count > 0 ? Math.max(10, Math.round((count / safeMax) * 100)) : 0
          const backgroundColor = getHeatMapColor(count)
          const isHovered = hoveredHour === hour.key

          return (
            <div key={hour.key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center rounded-t-lg bg-surface/70 p-1 relative">
                <div
                  className="w-full rounded-t-lg"
                  style={{ backgroundColor, height: `${heightPercent}%` }}
                  onMouseEnter={() => setHoveredHour(hour.key)}
                  onMouseLeave={() => setHoveredHour(null)}
                />
                <div
                  className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 text-xs font-semibold rounded-md bg-surface-container-high border border-outline-variant/60 text-on-surface whitespace-nowrap pointer-events-none transition-all duration-200 ease-out ${
                    isHovered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-1 scale-95'
                  }`}
                  style={{ zIndex: 50 }}
                >
                  <span className="capitalize">{hour.label}</span>: {count} ticket{count !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="text-center">
                <p className="text-label-sm font-semibold uppercase text-on-surface-variant">{hour.label}</p>
                <p className="font-hanken text-title-sm font-bold text-on-surface">{count}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AgentDashboardPage() {
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<TphTicket[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [hourlyCounts, setHourlyCounts] = useState<Record<string, number>>({})
  const [dataSource, setDataSource] = useState<TphDataSource>('tph')
  const [showHourlyBreakdown, setShowHourlyBreakdown] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedShiftDate, setSelectedShiftDate] = useState(() => getDateKey(getShiftDate(new Date())))
  const currentShiftDate = getDateKey(getShiftDate(new Date()))

  const loadTickets = useCallback(async (showFullLoader = false) => {
    if (!user?.email) {
      setTickets([])
      setStatusCounts({})
      setHourlyCounts({})
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    try {
      if (showFullLoader) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      setError('')

      const nextDataSource = getTphDataSourceForShiftDate(selectedShiftDate, currentShiftDate)
      setDataSource(nextDataSource)

      if (nextDataSource === 'tph_summary') {
        const agentKeys = Array.from(new Set([user.email, user.name].filter(Boolean))) as string[]
        const { data, error: summaryError } = await supabase
          .from('tph_summary')
          .select('shift_date, agent, tickets, hourly_tickets, created_at')
          .eq('shift_date', selectedShiftDate)
          .in('agent', agentKeys)
          .limit(1)

        if (summaryError) throw summaryError

        const summaryRow = ((data || []) as TphSummaryRow[])[0]

        setTickets([])
        setStatusCounts(parseSummaryTickets(summaryRow?.tickets))
        setHourlyCounts(parseHourlyTickets(summaryRow?.hourly_tickets))
        return
      }

      const { data, error: dbError } = await supabase
        .from('tph')
        .select('ticket_num, agent, status, shift_date, created_at')
        .eq('agent', user.email)
        .eq('shift_date', selectedShiftDate)
        .order('created_at', { ascending: false })
        .limit(10000)

      if (dbError) throw dbError

      const rawTickets = (data || []) as TphTicket[]
      const nextStatusCounts = TPH_STATUS_COLUMNS.reduce<Record<string, number>>((counts, status) => {
        counts[status] = rawTickets.filter((ticket) => ticket.status === status).length
        return counts
      }, {})
      const nextHourlyCounts = rawTickets.reduce<Record<string, number>>((counts, ticket) => {
        const phDate = getPhilippineDate(new Date(ticket.created_at))
        const hourKey = String(phDate.getHours()).padStart(2, '0')
        counts[hourKey] = (counts[hourKey] || 0) + 1
        return counts
      }, {})

      setTickets(rawTickets)
      setStatusCounts(nextStatusCounts)
      setHourlyCounts(nextHourlyCounts)
    } catch (err: any) {
      setError(err.message || 'Failed to load tickets')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [currentShiftDate, selectedShiftDate, user?.email, user?.name])

  useEffect(() => {
    loadTickets(true)
  }, [loadTickets])

  const ticketsByStatus = (status: string) => 
    tickets.filter(t => t.status === status)

  const sourceLabel = dataSource === 'tph' ? 'raw TPH rows' : 'TPH summary rows'
  const summaryTotalTickets = useMemo(
    () => TPH_STATUS_COLUMNS.reduce((total, status) => total + (statusCounts[status] || 0), 0),
    [statusCounts]
  )
  const activeHourlySlots = useMemo(
    () => hourSlots.filter((hour) => (hourlyCounts[hour.key] || 0) > 0).length,
    [hourlyCounts]
  )
  const ticketsPerHour = activeHourlySlots > 0 ? summaryTotalTickets / activeHourlySlots : 0
  const maxHourlyBarValue = useMemo(() => Math.max(1, ...Object.values(hourlyCounts)), [hourlyCounts])

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70">
        <div className="text-center">
          <Loader2 size={40} className="mx-auto mb-4 animate-spin text-primary-container" />
          <p className="text-on-surface-variant">Loading your tickets...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-label-md font-semibold uppercase text-primary-container">
            My Tickets
          </p>
          <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
            Your Worked-on Tickets
          </h1>
          {error && (
            <p className="mt-2 text-sm font-medium text-error">{error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface shadow-sm transition hover:border-primary-container">
            <CalendarDays size={18} className="text-primary-container" />
            <span>Shift Date</span>
            <input
              type="date"
              value={selectedShiftDate}
              onChange={(event) => {
                if (event.target.value) {
                  setSelectedShiftDate(event.target.value)
                }
              }}
              className="h-7 rounded border-none bg-transparent text-sm font-semibold text-on-surface outline-none"
              aria-label="Select shift date"
            />
          </label>

          <button
            type="button"
            onClick={() => loadTickets(false)}
            disabled={isRefreshing}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {dataSource === 'tph' && (
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface shadow-sm transition hover:border-primary-container">
              <Clock3 size={18} className="text-primary-container" />
              <span>Hourly</span>
              <input
                type="checkbox"
                checked={showHourlyBreakdown}
                onChange={(event) => setShowHourlyBreakdown(event.target.checked)}
                className="sr-only"
                aria-label="Toggle hourly ticket breakdown"
              />
              <span className={`relative h-6 w-11 rounded-full transition ${showHourlyBreakdown ? 'bg-primary-container' : 'bg-outline-variant'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${showHourlyBreakdown ? 'left-6' : 'left-1'}`} />
              </span>
            </label>
          )}
        </div>
      </div>

      {dataSource === 'tph_summary' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Sigma size={18} className="text-primary-container" />
                <p className="text-label-md font-semibold uppercase">Total Tickets</p>
              </div>
              <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">{summaryTotalTickets}</p>
            </div>
            <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Gauge size={18} className="text-primary-container" />
                <p className="text-label-md font-semibold uppercase">TPH</p>
              </div>
              <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">{ticketsPerHour.toFixed(2)}</p>
              <p className="mt-1 text-xs font-medium text-on-surface-variant">
                {activeHourlySlots} active {activeHourlySlots === 1 ? 'hour' : 'hours'}
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Clock3 size={18} className="text-primary-container" />
                <p className="text-label-md font-semibold uppercase">Hourly Tickets</p>
              </div>
              <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">
                {hourSlots.reduce((total, hour) => total + (hourlyCounts[hour.key] || 0), 0)}
              </p>
            </div>
          </div>

          <section className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Ticket size={18} className="text-primary-container" />
              <h2 className="font-hanken text-body-md font-bold text-on-surface">Tickets Per Status</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STATUS_LANES.map((lane) => (
                <div key={lane.key} className={`rounded-lg border bg-white p-4 ${lane.color}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${lane.icon}`}>
                        <Ticket size={18} />
                      </div>
                      <p className="font-hanken text-body-md font-bold text-on-surface">{lane.title}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-label-md font-bold ${lane.count}`}>
                      {statusCounts[lane.title] || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-primary-container" />
                <h2 className="font-hanken text-body-md font-bold text-on-surface">Hourly Tickets</h2>
              </div>
              <div className="rounded-full border border-outline-variant/60 bg-surface px-3 py-1 text-sm font-semibold text-on-surface">
                Max: {maxHourlyBarValue}
              </div>
            </div>
            <HourlyBarChart values={hourlyCounts} maxValue={maxHourlyBarValue} />
          </section>

          {summaryTotalTickets === 0 && (
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface/80 p-6 text-center text-sm text-on-surface-variant">
              No summary tickets found for this shift date.
            </div>
          )}
        </>
      ) : (
        <>
          {showHourlyBreakdown && (
            <section className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary-container" />
                  <h2 className="font-hanken text-body-md font-bold text-on-surface">Hourly Breakdown</h2>
                </div>
                <div className="rounded-full border border-outline-variant/60 bg-surface px-3 py-1 text-sm font-semibold text-on-surface">
                  Max: {maxHourlyBarValue}
                </div>
              </div>
              <HourlyBarChart values={hourlyCounts} maxValue={maxHourlyBarValue} />
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Sigma size={18} className="text-primary-container" />
                <p className="text-label-md font-semibold uppercase">Total Tickets</p>
              </div>
              <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">{summaryTotalTickets}</p>
            </div>
            <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Ticket size={18} className="text-primary-container" />
                <p className="text-label-md font-semibold uppercase">Processed Tickets</p>
              </div>
              <p className="mt-3 font-hanken text-headline-md font-bold text-on-surface">{summaryTotalTickets - (statusCounts['Open'] || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {STATUS_LANES.map((lane) => {
              const laneTickets = ticketsByStatus(lane.title)
              const laneCount = statusCounts[lane.title] || 0
              return (
                <section
                  key={lane.key}
                  className={`flex min-h-[400px] flex-col rounded-lg border bg-surface/90 ${lane.color}`}
                >
                  <div className={`border-b border-outline-variant/60 p-4 ${lane.header}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${lane.icon}`}>
                          <Ticket size={18} />
                        </div>
                        <h2 className="font-hanken text-body-md font-bold text-on-surface">
                          {lane.title}
                        </h2>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-label-md font-bold ${lane.count}`}>
                        {laneCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 p-3">
                    {laneTickets.length > 0 ? (
                      laneTickets.map((ticket) => (
                        <article
                          key={ticket.ticket_num}
                          className="rounded-lg border border-outline-variant/60 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-on-surface">
                              {ticket.ticket_num}
                            </span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                        No tickets
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
