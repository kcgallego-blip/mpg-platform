'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { supabase } from '@/lib/supabase'
import { Loader2, Ticket, CalendarDays, RefreshCw } from 'lucide-react'

type TphTicket = {
  ticket_num: number
  agent: string | null
  status: string | null
  shift_date: string | null
  created_at: string
}

const STATUS_LANES = [
  { key: 'Open', title: 'Open', color: 'border-red-300', header: 'bg-red-50', icon: 'bg-red-100 text-red-700', count: 'bg-red-100 text-red-800' },
  { key: 'Pending', title: 'Pending', color: 'border-blue-300', header: 'bg-blue-50', icon: 'bg-blue-100 text-blue-700', count: 'bg-blue-100 text-blue-800' },
  { key: 'Solved', title: 'Solved', color: 'border-gray-300', header: 'bg-gray-50', icon: 'bg-gray-100 text-gray-700', count: 'bg-gray-100 text-gray-800' },
  { key: 'On-Hold', title: 'On-Hold', color: 'border-slate-400', header: 'bg-slate-100', icon: 'bg-slate-200 text-slate-800', count: 'bg-slate-200 text-slate-900' },
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

  if (phDate.getHours() < 18) {
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

export default function AgentDashboardPage() {
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<TphTicket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedShiftDate, setSelectedShiftDate] = useState(() => getDateKey(getShiftDate(new Date())))

  const loadTickets = useCallback(async (showFullLoader = false) => {
    if (!user?.email) {
      setTickets([])
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

      const { data, error: dbError } = await supabase
        .from('tph')
        .select('ticket_num, agent, status, shift_date, created_at')
        .eq('agent', user.email)
        .eq('shift_date', selectedShiftDate)
        .order('created_at', { ascending: false })

      if (dbError) throw dbError

      setTickets(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load tickets')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedShiftDate, user?.email])

  useEffect(() => {
    loadTickets(true)
  }, [loadTickets])

  const ticketsByStatus = (status: string) => 
    tickets.filter(t => t.status === status)

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
            Your Assigned Tickets
          </h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            View your tickets from the TPH table for {formatSelectedDate(selectedShiftDate)}, organized by status.
          </p>
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {STATUS_LANES.map((lane) => {
          const laneTickets = ticketsByStatus(lane.title)
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
                    {laneTickets.length}
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
    </div>
  )
}
