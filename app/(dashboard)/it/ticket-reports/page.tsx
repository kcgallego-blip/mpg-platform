'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  History,
  Loader2,
  MessageSquarePlus,
  PauseCircle,
  RefreshCw,
  Search,
  Send,
  Tag,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { deleteOpenTicket, formatDate, runTicketWorkflow } from '@/lib/db'
import type { TicketWorkflowRequest } from '@/lib/db'
import type { Database } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import { getClientCache, invalidateClientCache, setClientCache } from '@/lib/clientCache'
import {
  formatAuditTimestamp,
  normalizeTicketStatus,
  parseTicketHistory,
  parseTicketNotes,
  type TicketStatus,
} from '@/lib/ticketAudit'
import {
  convertTwelveHourTimeToDatabaseTime,
  getCurrentManilaTime,
  type Meridiem,
} from '@/lib/ticketTime'

type Ticket = Database['public']['Tables']['tickets']['Row']
type TicketListItem = Pick<Ticket,
  | 'ticketid'
  | 'category'
  | 'concern'
  | 'date'
  | 'start_time'
  | 'name'
  | 'status'
  | 'team_leader'
  | 'assisted_by'
  | 'reported'
>
type Five9Logout = {
  id: string
  name: string | null
  start_time: string | null
  end_time: string | null
  created_at: string
}
type ViewMode = 'it-issues' | 'five9-logouts'
type StatusFilter = TicketStatus | 'All'
type TicketPageResponse = {
  tickets: TicketListItem[]
  total: number
  page: number
  pageSize: number
  statusCounts: Record<TicketStatus, number>
}
type Five9PageResponse = {
  records: Five9Logout[]
  total: number
  page: number
  pageSize: number
}

const IT_STAFF = [
  'Kevin Christopher Gallego',
  'Efraim Herald Malbas',
  'John Melmar Losauro',
] as const

const STATUS_TABS: Array<{ value: StatusFilter; icon: typeof CircleDot }> = [
  { value: 'Open', icon: CircleDot },
  { value: 'Pending', icon: PauseCircle },
  { value: 'Solved', icon: CheckCircle2 },
  { value: 'All', icon: History },
]
const PAGE_SIZE = 12
const LIST_CACHE_TTL_MS = 2 * 60 * 1000
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000

const toTicketListItem = (ticket: Ticket): TicketListItem => ({
  ticketid: ticket.ticketid,
  category: ticket.category,
  concern: ticket.concern,
  date: ticket.date,
  start_time: ticket.start_time,
  name: ticket.name,
  status: ticket.status,
  team_leader: ticket.team_leader,
  assisted_by: ticket.assisted_by,
  reported: ticket.reported,
})

function formatTime(time: string | null): string {
  if (!time) return '—'
  const match = time.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return time

  const hour = Number(match[1])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return time

  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour.toString().padStart(2, '0')}:${match[2]} ${period}`
}

function statusClass(status: TicketStatus): string {
  if (status === 'Open') return 'bg-error/15 text-error'
  if (status === 'Pending') return 'bg-primary-container/25 text-primary'
  return 'bg-success/15 text-success'
}

function StatusBadge({ status }: { status: string | null }) {
  const value = normalizeTicketStatus(status)
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(value)}`}>
      {value}
    </span>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</dt>
      <dd className="mt-1 text-sm text-on-surface">{value || '—'}</dd>
    </div>
  )
}

function HistoryPanel({ ticket }: { ticket: Ticket }) {
  const entries = parseTicketHistory(ticket.history)
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low/35 p-5">
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-primary" />
        <h3 className="font-hanken font-semibold text-on-surface">History</h3>
        <span className="ml-auto rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No history entries are available.</p>
      ) : (
        <ol>
          {entries.map((entry, index) => (
            <li key={`${entry.timestamp}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
              {index < entries.length - 1 && (
                <span className="absolute left-[5px] top-3 h-full w-px bg-outline-variant/50" />
              )}
              <span className="relative mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-primary bg-surface" />
              <div className="min-w-0">
                <p className="text-sm leading-5 text-on-surface">{entry.action}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {entry.actor} · {formatAuditTimestamp(entry.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function NotesPanel({
  ticket,
  noteText,
  saving,
  onChange,
  onSave,
}: {
  ticket: Ticket
  noteText: string
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  const notes = parseTicketNotes(ticket.notes)
  const canAdd = normalizeTicketStatus(ticket.status) !== 'Solved'
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low/35 p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquarePlus size={18} className="text-primary" />
        <h3 className="font-hanken font-semibold text-on-surface">Ticket Notes</h3>
        <span className="ml-auto rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-variant">
          {notes.length}
        </span>
      </div>
      {canAdd ? (
        <div className="mb-5 space-y-2">
          <label htmlFor="ticket-note" className="text-sm font-medium text-on-surface">Add a note</label>
          <textarea
            id="ticket-note"
            value={noteText}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Add an internal update or observation..."
            className="w-full resize-y rounded-lg border border-outline-variant/50 bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">Author and timestamp are automatic.</span>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !noteText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
              Save note
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-lg bg-surface-container-high/70 p-3 text-sm text-on-surface-variant">
          This ticket is solved and cannot accept new notes.
        </p>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No notes have been added.</p>
      ) : (
        <div className="space-y-3">
          {[...notes].reverse().map((note, index) => (
            <article key={`${note.timestamp}-${index}`} className="rounded-lg bg-surface p-3">
              <p className="whitespace-pre-wrap text-sm leading-5 text-on-surface">{note.note}</p>
              <p className="mt-2 text-xs text-on-surface-variant">
                {note.author} · {formatAuditTimestamp(note.timestamp)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default function ITReportsPage() {
  const user = useAuthStore((state) => state.user)
  const canManageTickets = Boolean(
    user?.role?.trim() && user.role.trim().toLowerCase() !== 'agent'
  )
  const [viewMode, setViewMode] = useState<ViewMode>('it-issues')
  const [tickets, setTickets] = useState<TicketListItem[]>([])
  const [five9Logouts, setFive9Logouts] = useState<Five9Logout[]>([])
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Open')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalTickets, setTotalTickets] = useState(0)
  const [totalFive9, setTotalFive9] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<TicketStatus, number>>({ Open: 0, Pending: 0, Solved: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [assistantOption, setAssistantOption] = useState('')
  const [customAssistant, setCustomAssistant] = useState('')
  const [troubleshooting, setTroubleshooting] = useState('')
  const [solveTime, setSolveTime] = useState('')
  const [solveMeridiem, setSolveMeridiem] = useState<Meridiem>('AM')
  const [noteText, setNoteText] = useState('')
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [savingAction, setSavingAction] = useState<TicketWorkflowRequest['action'] | 'delete' | null>(null)
  const [detailLoadingTicketId, setDetailLoadingTicketId] = useState<number | null>(null)

  const fetchTickets = useCallback(async (force = false) => {
    if (!user?.email) return

    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
        status: activeStatus,
      })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)

      const cachePrefix = `tickets:${user.email}:`
      const cacheKey = `${cachePrefix}${params.toString()}`
      if (force) invalidateClientCache(cachePrefix)
      let data = force ? null : getClientCache<TicketPageResponse>(cacheKey)

      if (!data) {
        const response = await fetch(`/api/tickets?${params.toString()}`, { cache: 'no-store' })
        data = await response.json() as TicketPageResponse
        if (!response.ok) throw new Error((data as TicketPageResponse & { error?: string }).error || 'Failed to load tickets')
        setClientCache(cacheKey, data, LIST_CACHE_TTL_MS)
      }

      setTickets(data.tickets || [])
      setTotalTickets(data.total || 0)
      setStatusCounts(data.statusCounts || { Open: 0, Pending: 0, Solved: 0 })
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [activeStatus, currentPage, dateFrom, dateTo, debouncedSearchQuery, user?.email])

  const fetchFive9 = useCallback(async (force = false) => {
    if (!user?.email) return

    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(currentPage), pageSize: String(PAGE_SIZE) })
      const cachePrefix = `five9:${user.email}:`
      const cacheKey = `${cachePrefix}${params.toString()}`
      if (force) invalidateClientCache(cachePrefix)
      let data = force ? null : getClientCache<Five9PageResponse>(cacheKey)

      if (!data) {
        const response = await fetch(`/api/five9?${params.toString()}`, { cache: 'no-store' })
        data = await response.json() as Five9PageResponse
        if (!response.ok) throw new Error((data as Five9PageResponse & { error?: string }).error || 'Failed to load Five9 records')
        setClientCache(cacheKey, data, LIST_CACHE_TTL_MS)
      }

      setFive9Logouts(data.records || [])
      setTotalFive9(data.total || 0)
    } catch (fetchError: unknown) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load Five9 logout issues')
    } finally {
      setLoading(false)
    }
  }, [currentPage, user?.email])

  useEffect(() => {
    if (!canManageTickets) {
      setLoading(false)
      return
    }
    void (viewMode === 'it-issues' ? fetchTickets() : fetchFive9())
  }, [canManageTickets, fetchFive9, fetchTickets, viewMode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentPage(1)
      setDebouncedSearchQuery(searchQuery.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const activeTotal = viewMode === 'it-issues' ? totalTickets : totalFive9
  const totalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE))
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const showTicketDetail = (ticket: Ticket) => {
    const currentTime = getCurrentManilaTime()
    const assistant = ticket.assisted_by?.trim() || ''
    if (IT_STAFF.some((staff) => staff === assistant)) {
      setAssistantOption(assistant)
      setCustomAssistant('')
    } else if (assistant) {
      setAssistantOption('Others')
      setCustomAssistant(assistant)
    } else {
      setAssistantOption('')
      setCustomAssistant('')
    }
    setSelectedTicket(ticket)
    setTroubleshooting(ticket.troubleshooting || '')
    setSolveTime(currentTime.time)
    setSolveMeridiem(currentTime.meridiem)
    setNoteText('')
    setWorkflowError(null)
  }

  const openTicket = async (ticketId: number) => {
    if (!user?.email) return

    try {
      setDetailLoadingTicketId(ticketId)
      setError(null)
      const cacheKey = `ticket-detail:${user.email}:${ticketId}`
      let ticket = getClientCache<Ticket>(cacheKey)

      if (!ticket) {
        const response = await fetch(`/api/tickets/${ticketId}`, { cache: 'no-store' })
        const payload = await response.json() as Ticket & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load ticket details')
        ticket = payload
        setClientCache(cacheKey, ticket, DETAIL_CACHE_TTL_MS)
      }

      showTicketDetail(ticket)
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Unable to load ticket details')
    } finally {
      setDetailLoadingTicketId(null)
    }
  }

  const assignedName = assistantOption === 'Others' ? customAssistant.trim() : assistantOption.trim()

  const notifyWebex = (ticket: Ticket, action: 'pending' | 'solve') => {
    if (!ticket.webex_message_id) return
    const endpoint = action === 'pending' ? 'ticket-status' : 'ticket-resolve'
    void fetch(`/api/webhook/${endpoint}?webex_message_id=${encodeURIComponent(ticket.webex_message_id)}`)
      .catch((webhookError) => console.error('Webex notification failed:', webhookError))
  }

  const performWorkflow = async (request: TicketWorkflowRequest, webexAction?: 'pending' | 'solve') => {
    if (!selectedTicket) return
    try {
      setSavingAction(request.action)
      setWorkflowError(null)
      const updated = await runTicketWorkflow(selectedTicket.ticketid, request)
      setTickets((current) => current.map((ticket) => ticket.ticketid === updated.ticketid ? toTicketListItem(updated) : ticket))
      showTicketDetail(updated)
      if (user?.email) {
        invalidateClientCache(`tickets:${user.email}:`)
        setClientCache(`ticket-detail:${user.email}:${updated.ticketid}`, updated, DETAIL_CACHE_TTL_MS)
      }
      if (request.action === 'add_note') setNoteText('')
      if (webexAction) notifyWebex(updated, webexAction)
    } catch (workflowFailure: unknown) {
      setWorkflowError(workflowFailure instanceof Error ? workflowFailure.message : 'Unable to update this ticket')
    } finally {
      setSavingAction(null)
    }
  }

  const handlePending = () => {
    if (!assignedName) {
      setWorkflowError('Select an Assisted By value before moving this ticket to Pending.')
      return
    }
    void performWorkflow({ action: 'pending', assistedBy: assignedName }, 'pending')
  }

  const handleSolve = () => {
    if (!troubleshooting.trim()) {
      setWorkflowError('Enter troubleshooting details before marking this ticket as Solved.')
      return
    }
    const endTime = convertTwelveHourTimeToDatabaseTime(solveTime, solveMeridiem)
    if (!endTime) {
      setWorkflowError('Enter a valid completion time in h:mm format, then select AM or PM.')
      return
    }
    void performWorkflow({
      action: 'solve',
      assistedBy: assignedName || undefined,
      troubleshooting: troubleshooting.trim(),
      endTime,
    }, 'solve')
  }

  const handleDelete = async () => {
    if (!selectedTicket || normalizeTicketStatus(selectedTicket.status) !== 'Open') {
      setWorkflowError('Only Open tickets can be deleted.')
      return
    }

    const confirmed = window.confirm(
      `Delete ticket #${selectedTicket.ticketid}? This permanently removes the database row and cannot be undone.`
    )
    if (!confirmed) return

    try {
      setSavingAction('delete')
      setWorkflowError(null)
      await deleteOpenTicket(selectedTicket.ticketid)
      setTickets((current) => current.filter((ticket) => ticket.ticketid !== selectedTicket.ticketid))
      setTotalTickets((current) => Math.max(0, current - 1))
      if (user?.email) {
        invalidateClientCache(`tickets:${user.email}:`)
        invalidateClientCache(`ticket-detail:${user.email}:${selectedTicket.ticketid}`)
      }
      setSelectedTicket(null)
    } catch (deleteFailure: unknown) {
      setWorkflowError(deleteFailure instanceof Error ? deleteFailure.message : 'Unable to delete this ticket')
    } finally {
      setSavingAction(null)
    }
  }

  const selectedStatus = selectedTicket ? normalizeTicketStatus(selectedTicket.status) : null
  const saving = savingAction !== null

  if (!canManageTickets) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-outline-variant/30 bg-surface p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-error" />
          <h1 className="mt-4 font-hanken text-headline-md font-bold text-on-surface">Ticket management restricted</h1>
          <p className="mt-2 text-sm text-on-surface-variant">IT ticket changes are available to assigned non-Agent roles.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-hanken text-display-lg font-bold text-on-surface">
            {viewMode === 'it-issues' ? 'IT Tickets' : 'Five9 Logout Issues'}
          </h1>
          <p className="mt-1 text-on-surface-variant">
            {viewMode === 'it-issues'
              ? 'Manage ticket assignments, progress, notes, and complete action history.'
              : 'Review Five9 logout records created by affected tickets.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-surface-container-low p-1">
            {(['it-issues', 'five9-logouts'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setCurrentPage(1)
                  setViewMode(mode)
                }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${viewMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                {mode === 'it-issues' ? 'IT Issues' : 'Five9 Logouts'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void (viewMode === 'it-issues' ? fetchTickets(true) : fetchFive9(true))}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/40 px-3 py-2 text-sm font-medium text-on-surface disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <Link href="/dashboard/it/submit-ticket" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary">
            <Send size={17} /> New ticket
          </Link>
        </div>
      </header>

      {viewMode === 'it-issues' && (
        <>
          <nav aria-label="Ticket status" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-container-low/60 p-2 sm:grid-cols-4">
            {STATUS_TABS.map(({ value, icon: Icon }) => {
              const count = value === 'All'
                ? statusCounts.Open + statusCounts.Pending + statusCounts.Solved
                : statusCounts[value]
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setCurrentPage(1); setActiveStatus(value) }}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${activeStatus === value ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface/60'}`}
                >
                  <Icon size={17} /> {value}
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs">{count}</span>
                </button>
              )
            })}
          </nav>
          <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low/25 p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search ticket ID, agent, category, concern, assignee..."
                  className="w-full rounded-lg border border-outline-variant/40 bg-surface py-2.5 pl-10 pr-3 text-sm text-on-surface outline-none focus:border-primary"
                />
              </div>
              {[{ label: 'From date', value: dateFrom, setter: setDateFrom }, { label: 'To date', value: dateTo, setter: setDateTo }].map((field) => (
                <label key={field.label} className="relative">
                  <span className="sr-only">{field.label}</span>
                  <Calendar size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="date"
                    value={field.value}
                    onChange={(event) => { setCurrentPage(1); field.setter(event.target.value) }}
                    className="rounded-lg border border-outline-variant/40 bg-surface py-2.5 pl-9 pr-3 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </label>
              ))}
              {(searchQuery || dateFrom || dateTo) && (
                <button type="button" onClick={() => { setCurrentPage(1); setSearchQuery(''); setDateFrom(''); setDateTo('') }} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high">
                  <X size={17} /> Clear
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {error && <div className="flex items-center gap-3 rounded-xl bg-error/10 p-4 text-error"><AlertCircle size={20} /><p className="text-sm">{error}</p></div>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-on-surface-variant"><Loader2 size={28} className="animate-spin text-primary" />Loading records...</div>
      ) : viewMode === 'it-issues' ? (
        tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/50 py-20 text-center text-on-surface-variant">No tickets match these filters.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-outline-variant/25 md:block">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    {['Status', 'Date / Time', 'Affected Agent', 'Category', 'Concern', 'Reported', 'Assisted by'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/15 bg-surface">
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.ticketid}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ticket ${ticket.ticketid}`}
                      onClick={() => void openTicket(ticket.ticketid)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void openTicket(ticket.ticketid) }}
                      className={`cursor-pointer hover:bg-surface-container-low/60 focus:outline-none ${detailLoadingTicketId === ticket.ticketid ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-4"><StatusBadge status={ticket.status} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-on-surface">{ticket.date ? formatDate(ticket.date) : '—'}<p className="font-mono text-xs text-on-surface-variant">{formatTime(ticket.start_time)}</p></td>
                      <td className="px-4 py-4 text-sm text-on-surface"><p className="font-medium">{ticket.name || 'Unknown'}</p><p className="text-xs text-on-surface-variant">#{ticket.ticketid}</p></td>
                      <td className="px-4 py-4 text-sm text-on-surface">{ticket.category || '—'}</td>
                      <td className="max-w-sm px-4 py-4 text-sm text-on-surface"><p className="line-clamp-2">{ticket.concern || '—'}</p></td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ticket.reported ? 'bg-success/15 text-success' : 'bg-surface-container-high text-on-surface-variant'}`}>
                          {ticket.reported ? 'Reported' : 'Not reported'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface">{ticket.assisted_by || 'Unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {tickets.map((ticket) => (
                <button key={ticket.ticketid} type="button" onClick={() => void openTicket(ticket.ticketid)} disabled={detailLoadingTicketId === ticket.ticketid} className="w-full rounded-xl border border-outline-variant/25 bg-surface p-4 text-left disabled:opacity-60">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-hanken font-semibold text-on-surface">{ticket.category || 'Uncategorized'}</p><p className="text-xs text-on-surface-variant">Ticket #{ticket.ticketid}</p></div><div className="flex flex-wrap justify-end gap-1.5">{ticket.reported && <span className="inline-flex rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Reported</span>}<StatusBadge status={ticket.status} /></div></div>
                  <p className="mt-3 line-clamp-2 text-sm text-on-surface">{ticket.concern || 'No concern provided'}</p>
                  <div className="mt-3 flex justify-between gap-3 text-xs text-on-surface-variant"><span>{ticket.name || 'Unknown reporter'}</span><span>{ticket.date ? formatDate(ticket.date) : '—'} · {formatTime(ticket.start_time)}</span></div>
                </button>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-on-surface-variant">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalTickets)} of {totalTickets}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Previous page" className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40"><ChevronLeft size={18} /></button>
                  <span className="text-sm">Page {currentPage} of {totalPages}</span>
                  <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Next page" className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40"><ChevronRight size={18} /></button>
                </div>
              </div>
            )}
          </>
        )
      ) : five9Logouts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/50 py-20 text-center text-on-surface-variant">No Five9 logout records found.</div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-outline-variant/25">
            <table className="w-full">
              <thead className="bg-surface-container-low"><tr className="text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{['Date', 'Name', 'Logout time', 'Login time'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-outline-variant/15 bg-surface">
                {five9Logouts.map((logout) => <tr key={logout.id}><td className="px-4 py-4 text-sm">{formatDate(logout.created_at)}</td><td className="px-4 py-4 text-sm">{logout.name || 'Unknown'}</td><td className="px-4 py-4 font-mono text-sm">{formatTime(logout.start_time)}</td><td className="px-4 py-4 font-mono text-sm">{formatTime(logout.end_time)}</td></tr>)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-on-surface-variant">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalFive9)} of {totalFive9}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Previous page" className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40"><ChevronLeft size={18} /></button>
                <span className="text-sm">Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Next page" className="rounded-lg border border-outline-variant/30 p-2 disabled:opacity-40"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTicket && selectedStatus && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/55 p-2 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelectedTicket(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title" className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-outline-variant/25 bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
              <div><div className="flex flex-wrap items-center gap-2"><h2 id="ticket-dialog-title" className="font-hanken text-headline-md font-bold text-on-surface">Ticket #{selectedTicket.ticketid}</h2><StatusBadge status={selectedTicket.status} /></div><p className="mt-1 text-sm text-on-surface-variant">Affected agent: {selectedTicket.name || 'Unknown'}</p></div>
              <button type="button" onClick={() => setSelectedTicket(null)} disabled={saving} aria-label="Close ticket details" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"><X size={22} /></button>
            </div>
            <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="space-y-5">
                <section className="rounded-xl border border-outline-variant/30 p-5">
                  <div className="mb-4 flex items-center gap-2"><Tag size={18} className="text-primary" /><h3 className="font-hanken font-semibold text-on-surface">Ticket Details</h3></div>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Affected Agent" value={selectedTicket.name} /><Detail label="Category" value={selectedTicket.category} />
                    <Detail label="Date" value={selectedTicket.date ? formatDate(selectedTicket.date) : '—'} /><Detail label="Start Time" value={formatTime(selectedTicket.start_time)} /><Detail label="End Time" value={formatTime(selectedTicket.end_time)} />
                    <Detail label="Five9 Affected" value={selectedTicket.affected_five9 ? 'Yes' : 'No'} /><Detail label="Assisted By" value={selectedTicket.assisted_by || 'Unassigned'} />
                  </dl>
                  <div className="mt-5 border-t border-outline-variant/20 pt-4">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-surface-container-low/60 p-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTicket.reported)}
                        onChange={(event) => void performWorkflow({ action: 'set_reported', reported: event.target.checked })}
                        disabled={saving}
                        className="mt-0.5 h-5 w-5 rounded border-outline-variant text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-on-surface">Reported</span>
                        <span className="mt-0.5 block text-xs text-on-surface-variant">Available in Open, Pending, and Solved tickets. Changes are added to history.</span>
                      </span>
                      {savingAction === 'set_reported' && <Loader2 size={17} className="ml-auto animate-spin text-primary" />}
                    </label>
                  </div>
                  <div className="mt-5 border-t border-outline-variant/20 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Concern</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-on-surface">{selectedTicket.concern || 'No concern provided.'}</p></div>
                </section>

                <section className="rounded-xl border border-outline-variant/30 p-5">
                  <div className="mb-4 flex items-center gap-2"><Wrench size={18} className="text-primary" /><h3 className="font-hanken font-semibold text-on-surface">{selectedStatus === 'Solved' ? 'Resolution' : 'Workflow'}</h3></div>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="assisted-by" className="mb-1.5 block text-sm font-medium text-on-surface">Assisted By {selectedStatus === 'Open' && <span className="text-error">*</span>}</label>
                      {selectedStatus === 'Solved' ? (
                        <p className="rounded-lg bg-surface-container-low px-3 py-2.5 text-sm">{selectedTicket.assisted_by || selectedTicket.name || 'Unknown'}</p>
                      ) : (
                        <>
                          <select id="assisted-by" value={assistantOption} onChange={(event) => { setAssistantOption(event.target.value); if (event.target.value !== 'Others') setCustomAssistant(''); setWorkflowError(null) }} disabled={saving} className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low/40 px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary">
                            <option value="">Select IT staff...</option>{IT_STAFF.map((staff) => <option key={staff} value={staff}>{staff}</option>)}<option value="Others">Others</option>
                          </select>
                          {assistantOption === 'Others' && <input type="text" value={customAssistant} onChange={(event) => { setCustomAssistant(event.target.value); setWorkflowError(null) }} maxLength={200} autoFocus placeholder="Enter staff member name" disabled={saving} className="mt-2 w-full rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />}
                          {selectedStatus === 'Open' && !assignedName && <p className="mt-1.5 text-xs text-on-surface-variant">Required for Pending. If solved directly, the reporter is used as the fallback.</p>}
                        </>
                      )}
                    </div>
                    <div>
                      <label htmlFor="troubleshooting" className="mb-1.5 block text-sm font-medium text-on-surface">Troubleshooting {selectedStatus !== 'Solved' && <span className="text-error">*</span>}</label>
                      {selectedStatus === 'Solved' ? (
                        <p className="min-h-20 whitespace-pre-wrap rounded-lg bg-surface-container-low px-3 py-2.5 text-sm leading-6">{selectedTicket.troubleshooting || 'No troubleshooting details recorded.'}</p>
                      ) : (
                        <textarea id="troubleshooting" value={troubleshooting} onChange={(event) => { setTroubleshooting(event.target.value); setWorkflowError(null) }} rows={5} maxLength={8000} placeholder="Document diagnostics and troubleshooting steps..." disabled={saving} className="w-full resize-y rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary" />
                      )}
                    </div>
                    {selectedStatus !== 'Solved' && (
                      <div>
                        <label htmlFor="solve-time" className="mb-1.5 block text-sm font-medium text-on-surface">
                          Completion Time <span className="text-error">*</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="solve-time"
                            type="text"
                            inputMode="numeric"
                            value={solveTime}
                            onChange={(event) => { setSolveTime(event.target.value); setWorkflowError(null) }}
                            placeholder="h:mm"
                            maxLength={5}
                            disabled={saving}
                            aria-describedby="solve-time-hint"
                            className="min-w-0 flex-1 rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                          />
                          <select
                            aria-label="Completion time AM or PM"
                            value={solveMeridiem}
                            onChange={(event) => { setSolveMeridiem(event.target.value as Meridiem); setWorkflowError(null) }}
                            disabled={saving}
                            className="w-24 rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                        <p id="solve-time-hint" className="mt-1.5 text-xs text-on-surface-variant">
                          Current Philippine time is filled in automatically. Use h:mm format.
                        </p>
                      </div>
                    )}
                    {workflowError && <div className="flex items-start gap-2 rounded-lg bg-error/10 p-3 text-sm text-error"><AlertCircle size={17} className="mt-0.5 shrink-0" />{workflowError}</div>}
                    {selectedStatus !== 'Solved' && (
                      <div className="flex flex-col-reverse gap-2 border-t border-outline-variant/20 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
                        {selectedStatus === 'Open' && <button type="button" onClick={() => void handleDelete()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg border border-error/40 px-4 py-2.5 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-45 sm:mr-auto">{savingAction === 'delete' ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}Delete ticket</button>}
                        <button type="button" onClick={() => void performWorkflow({ action: 'save_troubleshooting', troubleshooting: troubleshooting.trim() })} disabled={saving || !troubleshooting.trim() || troubleshooting.trim() === (selectedTicket.troubleshooting || '').trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 px-4 py-2.5 text-sm font-medium disabled:opacity-45">{savingAction === 'save_troubleshooting' ? <Loader2 size={17} className="animate-spin" /> : <Wrench size={17} />}Save progress</button>
                        {selectedStatus === 'Open' && <button type="button" onClick={handlePending} disabled={saving || !assignedName} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-sm font-medium text-on-primary-container disabled:opacity-45">{savingAction === 'pending' ? <Loader2 size={17} className="animate-spin" /> : <PauseCircle size={17} />}Put to Pending</button>}
                        <button type="button" onClick={handleSolve} disabled={saving || !troubleshooting.trim() || !solveTime.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-on-success disabled:opacity-45">{savingAction === 'solve' ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Mark as Solved</button>
                      </div>
                    )}
                  </div>
                </section>

                <NotesPanel
                  ticket={selectedTicket}
                  noteText={noteText}
                  saving={saving}
                  onChange={(value) => { setNoteText(value); setWorkflowError(null) }}
                  onSave={() => void performWorkflow({ action: 'add_note', note: noteText.trim() })}
                />
              </div>
              <HistoryPanel ticket={selectedTicket} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
