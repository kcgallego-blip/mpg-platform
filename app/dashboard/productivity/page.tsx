'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownUp, BarChart3, CalendarDays, Clock3, Loader2, RefreshCw, ShieldAlert, Table2, X } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { supabase } from '@/lib/supabase'

type ProductivityView = 'status' | 'hour'

type TphTicket = {
  ticket_num: number
  agent: string | null
  status: string | null
  shift_date: string | null
  created_at: string
}

type UserNameRow = {
  email: string
  name: string | null
}

type AgentProductivity = {
  email: string
  name: string
  total: number
  statusCounts: Record<string, number>
  hourlyCounts: Record<string, number>
  firstTicketTime: string | null
  latestTicketTime: string | null
  shiftDuration: string
  shiftDurationMs: number
}

type SortedAgentSummary = {
  email: string
  name: string
  totalTickets: number
  firstTicketTime: string | null
  latestTicketTime: string | null
  shiftDuration: string
  shiftDurationMs: number
}

const ALLOWED_ROLES = ['Admin', 'Supervisor', 'Operations Manager', 'Team Leader']
const STATUS_COLUMNS = ['Open', 'Pending', 'Solved', 'On-Hold']
const STATUS_FILTERS = ['All', ...STATUS_COLUMNS]

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

  if (phDate.getHours() < 18) {
    shiftDate.setDate(shiftDate.getDate() - 1)
  }

  return shiftDate
}

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const formatDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

const getEmailFallbackName = (email: string) => {
  const localPart = email.split('@')[0] || email
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || email
}

const getHourKeyFromTimestamp = (timestamp: string) => {
  const phDate = getPhilippineDate(new Date(timestamp))
  return String(phDate.getHours()).padStart(2, '0')
}

const formatTicketTime = (timestamp: string | null) => {
  if (!timestamp) return '-'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp))
}

const formatDuration = (durationMs: number) => {
  const totalMinutes = Math.floor(durationMs / (60 * 1000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
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

export default function ProductivityPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<TphTicket[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [selectedShiftDate, setSelectedShiftDate] = useState(() => getDateKey(getShiftDate(new Date())))
  const [selectedStatus, setSelectedStatus] = useState('All')
  const [view, setView] = useState<ProductivityView>('status')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSorting, setIsSorting] = useState(false)
  const [error, setError] = useState('')
  const [sortedAgentSummaries, setSortedAgentSummaries] = useState<SortedAgentSummary[]>([])
  const [selectedAgentEmail, setSelectedAgentEmail] = useState<string | null>(null)

  const currentShiftDate = useMemo(() => getDateKey(getShiftDate(new Date())), [])
  const isAllowed = !!user?.role && ALLOWED_ROLES.includes(user.role)

  useEffect(() => {
    if (user?.role && !isAllowed) {
      router.replace('/dashboard')
    }
  }, [isAllowed, router, user?.role])

  const loadProductivity = useCallback(async (showFullLoader = false) => {
    if (!isAllowed) {
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

      let tphQuery = supabase
        .from('tph')
        .select('ticket_num, agent, status, shift_date, created_at')
        .eq('shift_date', selectedShiftDate)
        .order('created_at', { ascending: true })

      if (selectedStatus !== 'All') {
        tphQuery = tphQuery.ilike('status', selectedStatus)
      }

      const { data: tphData, error: tphError } = await tphQuery

      if (tphError) throw tphError

      const nextTickets = (tphData || []) as TphTicket[]
      setTickets(nextTickets)

      const emails = Array.from(
        new Set(nextTickets.map((ticket) => ticket.agent).filter((email): email is string => !!email))
      )

      if (emails.length === 0) {
        setUserNames({})
        return
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('email, name')
        .in('email', emails)

      if (usersError) throw usersError

      const nextUserNames = ((usersData || []) as UserNameRow[]).reduce<Record<string, string>>((names, row) => {
        names[row.email] = row.name || getEmailFallbackName(row.email)
        return names
      }, {})

      setUserNames(nextUserNames)
    } catch (err: any) {
      setError(err.message || 'Failed to load productivity data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isAllowed, selectedShiftDate, selectedStatus])

  useEffect(() => {
    loadProductivity(true)
  }, [loadProductivity])

  useEffect(() => {
    setSortedAgentSummaries([])
  }, [selectedShiftDate, selectedStatus])

  const sortProductivity = useCallback(async () => {
    try {
      setIsSorting(true)
      setError('')

      const params = new URLSearchParams({
        shiftDate: selectedShiftDate,
        status: selectedStatus,
      })

      const response = await fetch(`/api/productivity/sorted?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const data = (await response.json()) as {
        agents?: SortedAgentSummary[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to sort productivity data')
      }

      setSortedAgentSummaries(data.agents || [])
    } catch (err: any) {
      setError(err.message || 'Unable to sort productivity data')
    } finally {
      setIsSorting(false)
    }
  }, [selectedShiftDate, selectedStatus])

  const productivityRows = useMemo(() => {
    const rowsByEmail = new Map<string, AgentProductivity>()
    const sortedSummaryByEmail = new Map(sortedAgentSummaries.map((summary) => [summary.email, summary]))

    tickets.forEach((ticket) => {
      if (!ticket.agent) return

      const existingRow = rowsByEmail.get(ticket.agent)
      const sortedSummary = sortedSummaryByEmail.get(ticket.agent)
      const row = existingRow || {
        email: ticket.agent,
        name: sortedSummary?.name || userNames[ticket.agent] || getEmailFallbackName(ticket.agent),
        total: 0,
        statusCounts: {},
        hourlyCounts: {},
        firstTicketTime: null,
        latestTicketTime: null,
        shiftDuration: '0h 0m',
        shiftDurationMs: 0,
      }

      const status = ticket.status || 'No Status'
      const hourKey = getHourKeyFromTimestamp(ticket.created_at)
      const createdAtTime = Date.parse(ticket.created_at)
      const firstTime = row.firstTicketTime ? Date.parse(row.firstTicketTime) : createdAtTime
      const latestTime = row.latestTicketTime ? Date.parse(row.latestTicketTime) : createdAtTime

      row.total += 1
      row.statusCounts[status] = (row.statusCounts[status] || 0) + 1
      row.hourlyCounts[hourKey] = (row.hourlyCounts[hourKey] || 0) + 1

      if (!row.firstTicketTime || createdAtTime < firstTime) {
        row.firstTicketTime = ticket.created_at
      }

      if (!row.latestTicketTime || createdAtTime > latestTime) {
        row.latestTicketTime = ticket.created_at
      }

      rowsByEmail.set(ticket.agent, row)
    })

    const rows = Array.from(rowsByEmail.values()).map((row) => {
      const sortedSummary = sortedSummaryByEmail.get(row.email)

      if (sortedSummary) {
        return {
          ...row,
          name: sortedSummary.name,
          firstTicketTime: sortedSummary.firstTicketTime,
          latestTicketTime: sortedSummary.latestTicketTime,
          shiftDuration: sortedSummary.shiftDuration,
          shiftDurationMs: sortedSummary.shiftDurationMs,
        }
      }

      const firstTime = row.firstTicketTime ? Date.parse(row.firstTicketTime) : 0
      const latestTime = row.latestTicketTime ? Date.parse(row.latestTicketTime) : 0
      const shiftDurationMs = Math.max(latestTime - firstTime, 0)

      return {
        ...row,
        shiftDurationMs,
        shiftDuration: formatDuration(shiftDurationMs),
      }
    })

    if (sortedAgentSummaries.length > 0) {
      const sortedPositionByEmail = new Map(
        sortedAgentSummaries.map((summary, index) => [summary.email, index])
      )

      return rows.sort((first, second) => {
        const firstPosition = sortedPositionByEmail.get(first.email) ?? Number.MAX_SAFE_INTEGER
        const secondPosition = sortedPositionByEmail.get(second.email) ?? Number.MAX_SAFE_INTEGER
        return firstPosition - secondPosition
      })
    }

    return rows.sort((first, second) => first.name.localeCompare(second.name))
  }, [sortedAgentSummaries, tickets, userNames])

  const totals = useMemo(() => {
    return productivityRows.reduce(
      (summary, row) => {
        summary.tickets += row.total
        STATUS_COLUMNS.forEach((status) => {
          summary.statusCounts[status] = (summary.statusCounts[status] || 0) + (row.statusCounts[status] || 0)
        })
        hourSlots.forEach((hour) => {
          summary.hourlyCounts[hour.key] = (summary.hourlyCounts[hour.key] || 0) + (row.hourlyCounts[hour.key] || 0)
        })
        return summary
      },
      {
        tickets: 0,
        statusCounts: {} as Record<string, number>,
        hourlyCounts: {} as Record<string, number>,
      }
    )
  }, [productivityRows])

  const selectedAgentTickets = useMemo(() => {
    if (!selectedAgentEmail) return []
    return tickets.filter((ticket) => ticket.agent === selectedAgentEmail)
  }, [selectedAgentEmail, tickets])

  if (!isAllowed) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/80 p-6">
        <div className="text-center">
          <ShieldAlert size={40} className="mx-auto mb-4 text-error" />
          <p className="font-semibold text-on-surface">Productivity is not available for this role.</p>
        </div>
      </div>
    )
  }

  const selectedAgent = productivityRows.find((row) => row.email === selectedAgentEmail)

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-outline-variant/60 bg-surface/70">
        <div className="text-center">
          <Loader2 size={40} className="mx-auto mb-4 animate-spin text-primary-container" />
          <p className="text-on-surface-variant">Loading productivity...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-label-md font-semibold uppercase text-primary-container">
            Dashboard
          </p>
          <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
            Productivity
          </h1>
          <p className="mt-2 max-w-3xl text-on-surface-variant">
            Ticket counts from the TPH table for {formatDateKey(selectedShiftDate)}. Current shift date is {formatDateKey(currentShiftDate)}.
            {sortedAgentSummaries.length > 0 && ' Sorted by lowest ticket count, then longest duration.'}
          </p>
          {error && (
            <p className="mt-2 text-sm font-medium text-error">{error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface shadow-sm transition hover:border-primary-container">
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

          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface shadow-sm transition hover:border-primary-container">
            <span>Status</span>
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              className="h-7 rounded border-none bg-transparent text-sm font-semibold text-on-surface outline-none"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div className="flex rounded-lg border border-outline-variant bg-surface p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('status')}
              className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition ${
                view === 'status' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Table2 size={16} />
              Status
            </button>
            <button
              type="button"
              onClick={() => setView('hour')}
              className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition ${
                view === 'hour' ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Clock3 size={16} />
              Hour
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadProductivity(false)}
            disabled={isRefreshing}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-on-primary-container shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={sortProductivity}
            disabled={isSorting}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-primary-container bg-surface px-4 py-2 text-sm font-bold text-primary-container shadow-sm transition hover:bg-primary-container/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ArrowDownUp size={18} className={isSorting ? 'animate-pulse' : ''} />
            Sort
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
          <p className="text-label-md font-semibold uppercase text-on-surface-variant">Agents</p>
          <p className="mt-2 font-hanken text-headline-md font-bold text-on-surface">{productivityRows.length}</p>
        </div>
        <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
          <p className="text-label-md font-semibold uppercase text-on-surface-variant">Tickets</p>
          <p className="mt-2 font-hanken text-headline-md font-bold text-on-surface">{totals.tickets}</p>
        </div>
        <div className="rounded-lg border border-outline-variant/60 bg-surface/90 p-4">
          <p className="text-label-md font-semibold uppercase text-on-surface-variant">View</p>
          <p className="mt-2 flex items-center gap-2 font-hanken text-headline-md font-bold text-on-surface">
            <BarChart3 size={24} className="text-primary-container" />
            {view === 'status' ? 'Per Status' : 'Per Hour'}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant/60 bg-surface/95 shadow-sm">
        <div className="overflow-x-auto">
          {view === 'status' ? (
            <table className="min-w-full divide-y divide-outline-variant/60">
              <thead className="bg-surface-container/80">
                <tr>
                  <th className="px-4 py-3 text-left text-label-md font-bold uppercase text-on-surface-variant">Agent</th>
                  {STATUS_COLUMNS.map((status) => (
                    <th key={status} className="px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">
                      {status}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Total</th>
                  <th className="px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">First</th>
                  <th className="px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Latest</th>
                  <th className="px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {productivityRows.map((row) => (
                  <tr key={row.email} className="cursor-pointer hover:bg-surface-container/60 transition" onClick={() => setSelectedAgentEmail(row.email)}>
                    <td className="min-w-64 px-4 py-3">
                      <p className="font-semibold text-on-surface">{row.name}</p>
                      <p className="text-xs text-on-surface-variant">{row.email}</p>
                    </td>
                    {STATUS_COLUMNS.map((status) => (
                      <td key={status} className="px-4 py-3 text-center text-sm font-semibold text-on-surface">
                        {row.statusCounts[status] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-bold text-primary-container">{row.total}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-on-surface">{formatTicketTime(row.firstTicketTime)}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-on-surface">{formatTicketTime(row.latestTicketTime)}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">{row.shiftDuration}</td>
                  </tr>
                ))}
                {productivityRows.length > 0 && (
                  <tr className="bg-surface-container/70">
                    <td className="px-4 py-3 font-bold text-on-surface">Total</td>
                    {STATUS_COLUMNS.map((status) => (
                      <td key={status} className="px-4 py-3 text-center text-sm font-bold text-on-surface">
                        {totals.statusCounts[status] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-bold text-primary-container">{totals.tickets}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-outline-variant/60">
              <thead className="bg-surface-container/80">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface-container px-4 py-3 text-left text-label-md font-bold uppercase text-on-surface-variant">Agent</th>
                  {hourSlots.map((hour) => (
                    <th key={hour.key} className="min-w-20 px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">
                      {hour.label}
                    </th>
                  ))}
                  <th className="min-w-20 px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Total</th>
                  <th className="min-w-24 px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">First</th>
                  <th className="min-w-24 px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Latest</th>
                  <th className="min-w-24 px-4 py-3 text-center text-label-md font-bold uppercase text-on-surface-variant">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {productivityRows.map((row) => (
                  <tr key={row.email} className="cursor-pointer hover:bg-surface-container/60 transition" onClick={() => setSelectedAgentEmail(row.email)}>
                    <td className="sticky left-0 z-10 min-w-64 bg-surface px-4 py-3">
                      <p className="font-semibold text-on-surface">{row.name}</p>
                      <p className="text-xs text-on-surface-variant">{row.email}</p>
                    </td>
                    {hourSlots.map((hour) => (
                      <td key={hour.key} className="px-4 py-3 text-center text-sm font-semibold text-on-surface">
                        {row.hourlyCounts[hour.key] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-bold text-primary-container">{row.total}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-on-surface">{formatTicketTime(row.firstTicketTime)}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-on-surface">{formatTicketTime(row.latestTicketTime)}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">{row.shiftDuration}</td>
                  </tr>
                ))}
                {productivityRows.length > 0 && (
                  <tr className="bg-surface-container/70">
                    <td className="sticky left-0 z-10 bg-surface-container px-4 py-3 font-bold text-on-surface">Total</td>
                    {hourSlots.map((hour) => (
                      <td key={hour.key} className="px-4 py-3 text-center text-sm font-bold text-on-surface">
                        {totals.hourlyCounts[hour.key] || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-bold text-primary-container">{totals.tickets}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-on-surface">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {productivityRows.length === 0 && (
          <div className="flex min-h-48 items-center justify-center border-t border-outline-variant/60 p-6 text-center text-sm text-on-surface-variant">
            No TPH tickets found for this shift date.
          </div>
        )}
      </section>
      </div>

      {selectedAgentEmail && selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-outline-variant/60 bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container/80 px-6 py-4">
              <div>
                <h2 className="font-semibold text-on-surface">{selectedAgent.name}</h2>
                <p className="text-xs text-on-surface-variant">{selectedAgent.email}</p>
              </div>
              <button
                onClick={() => setSelectedAgentEmail(null)}
                className="rounded-lg p-1 transition hover:bg-surface-container-high"
                aria-label="Close modal"
              >
                <X size={20} className="text-on-surface-variant" />
              </button>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
              <table className="min-w-full divide-y divide-outline-variant/60">
                <thead className="bg-surface-container/60 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold uppercase text-on-surface-variant">Ticket</th>
                    <th className="px-3 py-2 text-left text-xs font-bold uppercase text-on-surface-variant">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {selectedAgentTickets.map((ticket, index) => (
                    <tr key={`${ticket.ticket_num}-${index}`} className="hover:bg-surface-container/40">
                      <td className="px-3 py-2 text-xs font-semibold text-on-surface">{ticket.ticket_num}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-on-surface">{ticket.status || 'No Status'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedAgentTickets.length === 0 && (
                <div className="flex items-center justify-center border-t border-outline-variant/60 p-4 text-xs text-on-surface-variant">
                  No tickets found for this agent.
                </div>
              )}
            </div>

            <div className="border-t border-outline-variant/60 bg-surface-container/40 px-6 py-3 text-right text-xs font-semibold text-on-surface">
              Total Tickets: {selectedAgentTickets.length}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
