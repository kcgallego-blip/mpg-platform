'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { supabase } from '@/lib/supabase'
import { Loader2, Ticket, AlertCircle } from 'lucide-react'

type TphTicket = {
  ticket_num: number
  agent: string | null
  status: string | null
  created_at: string
}

const STATUS_LANES = [
  { key: 'Open', title: 'Open', color: 'border-red-300', header: 'bg-red-50', icon: 'bg-red-100 text-red-700', count: 'bg-red-100 text-red-800' },
  { key: 'Pending', title: 'Pending', color: 'border-blue-300', header: 'bg-blue-50', icon: 'bg-blue-100 text-blue-700', count: 'bg-blue-100 text-blue-800' },
  { key: 'Solved', title: 'Solved', color: 'border-gray-300', header: 'bg-gray-50', icon: 'bg-gray-100 text-gray-700', count: 'bg-gray-100 text-gray-800' },
  { key: 'On-Hold', title: 'On-Hold', color: 'border-slate-400', header: 'bg-slate-100', icon: 'bg-slate-200 text-slate-800', count: 'bg-slate-200 text-slate-900' },
]

export default function AgentDashboardPage() {
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<TphTicket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadTickets = async () => {
      if (!user?.email) return

      try {
        setIsLoading(true)
        setError('')

        const { data, error: dbError } = await supabase
          .from('tph')
          .select('ticket_num, agent, status, created_at')
          .eq('agent', user.email)

        if (dbError) throw dbError

        setTickets(data || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load tickets')
      } finally {
        setIsLoading(false)
      }
    }

    loadTickets()
  }, [user?.email])

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

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-error/30 bg-error/10 p-6">
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-error" />
          <p className="text-error">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <p className="text-label-md font-semibold uppercase text-primary-container">
          My Tickets
        </p>
        <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
          Your Assigned Tickets
        </h1>
        <p className="mt-2 max-w-2xl text-on-surface-variant">
          View your tickets from the TPH table, organized by status.
        </p>
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