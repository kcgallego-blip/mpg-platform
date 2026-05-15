'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  User,
  Tag,
  Building2,
  Phone,
  X,
  Clock,
  Wrench,
  Save,
  Edit3,
} from 'lucide-react'
import { getTickets, getFive9LogoutIssues, updateTicket, formatDate } from '@/lib/db'

type Ticket = {
  ticketid: number
  category: string | null
  concern: string | null
  date: string | null
  start_time: string | null
  name: string | null
  team_leader: string | null
  onsite: boolean | null
  affected_five9: boolean | null
  webex_message_id: string | null
  end_time: string | null
  troubleshooting: string | null
  assisted_by: string | null
  status: string | null
  created_at: string
  updated_at: string
}

type Five9Logout = {
  id: string
  name: string | null
  start_time: string | null
  end_time: string | null
  created_at: string
}

type ViewMode = 'it-issues' | 'five9-logouts'

type SortColumn = 'status' | 'date' | 'team_leader' | 'name' | 'category' | 'concern' | 'start_time' | 'end_time' | 'troubleshooting' | 'onsite' | 'affected_five9' | 'assisted_by'
type SortDirection = 'asc' | 'desc'

// Format time as HH:MM (without seconds)
function formatTime(timeStr: string | null): string {
  if (!timeStr) return '-'
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr
  const match = timeStr.match(/^(\d{2}:\d{2})/)
  return match ? match[1] : timeStr
}

// Parse time string to ensure HH:MM format
function parseTime(value: string): string {
  const cleaned = value.replace(/[^\d:]/g, '')
  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})/)
  if (match) {
    const hours = parseInt(match[1]).toString().padStart(2, '0')
    const minutes = parseInt(match[2]).toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }
  return value
}

export default function ITReportsPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('it-issues')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [five9Logouts, setFive9Logouts] = useState<Five9Logout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingTicket, setSavingTicket] = useState<number | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchField, setSearchField] = useState<SortColumn | ''>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Editable fields state
  const [editingEndTime, setEditingEndTime] = useState<number | null>(null)
  const [editingTroubleshooting, setEditingTroubleshooting] = useState<number | null>(null)
  const [editingAssistedBy, setEditingAssistedBy] = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [troubleshootingTicket, setTroubleshootingTicket] = useState<Ticket | null>(null)
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)
  const [tempEndTime, setTempEndTime] = useState('')
  const [tempTroubleshooting, setTempTroubleshooting] = useState('')
  const [tempAssistedBy, setTempAssistedBy] = useState('')

  // Assisted By options
  const assistedByOptions = [
    'Kevin Christopher Gallego',
    'Efraim Herald Malbas',
    'John Melmar Losauro'
  ]

  // Fetch tickets
  const fetchTickets = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getTickets()
      setTickets(data)
    } catch (err: any) {
      console.error('Error fetching tickets:', err)
      setError(err.message || 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  const fetchFive9LogoutIssues = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getFive9LogoutIssues()
      setFive9Logouts(data)
    } catch (err: any) {
      console.error('Error fetching Five9 logout issues:', err)
      setError(err.message || 'Failed to load Five9 logout issues')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (viewMode === 'it-issues') {
      fetchTickets()
    } else {
      fetchFive9LogoutIssues()
    }
  }, [viewMode])

  // Filter and sort logic
  const filteredAndSortedTickets = useMemo(() => {
    let result = [...tickets]

    if (dateFrom) {
      result = result.filter((t) => t.date && t.date >= dateFrom)
    }
    if (dateTo) {
      result = result.filter((t) => t.date && t.date <= dateTo)
    }

    if (searchField && searchQuery) {
      result = result.filter((ticket) => {
        const fieldValue = ticket[searchField]
        if (fieldValue === null || fieldValue === undefined) return false
        if (searchField === 'onsite' || searchField === 'affected_five9') {
          const boolStr = fieldValue ? 'yes' : 'no'
          return boolStr.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return String(fieldValue).toLowerCase().includes(searchQuery.toLowerCase())
      })
    }

    result.sort((a, b) => {
      let aVal: any = a[sortColumn]
      let bVal: any = b[sortColumn]
      if (aVal === null) aVal = sortDirection === 'asc' ? '' : '~'
      if (bVal === null) bVal = sortDirection === 'asc' ? '' : '~'
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [tickets, dateFrom, dateTo, searchField, searchQuery, sortColumn, sortDirection])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTickets.length / itemsPerPage)
  const paginatedTickets = filteredAndSortedTickets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setSearchField('')
    setSearchQuery('')
    setSortColumn('date')
    setSortDirection('desc')
    setCurrentPage(1)
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return null
    return sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
  }

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'bg-error-container text-on-error-container'
      case 'pending':
        return 'bg-primary-container text-on-primary-container'
      case 'resolved':
      case 'completed':
      case 'finished':
        return 'bg-surface-container-highest text-on-surface'
      default:
        return 'bg-surface-container-highest text-on-surface'
    }
  }

  const handleEndTimeSave = async (ticketId: number) => {
    if (!tempEndTime.trim()) {
      setEditingEndTime(null)
      return
    }
    const parsedTime = parseTime(tempEndTime)
    setSavingTicket(ticketId)
    try {
      await updateTicket(ticketId, { end_time: parsedTime })
      setTickets(prev =>
        prev.map(t => t.ticketid === ticketId ? { ...t, end_time: parsedTime } : t)
      )
      setEditingEndTime(null)
    } catch (err) {
      console.error('Error updating end_time:', err)
      alert('Failed to update end time')
    } finally {
      setSavingTicket(null)
    }
  }

  const handleTroubleshootingSave = async (ticketId: number) => {
    if (!tempTroubleshooting.trim()) {
      setEditingTroubleshooting(null)
      return
    }
    setSavingTicket(ticketId)
    try {
      await updateTicket(ticketId, { troubleshooting: tempTroubleshooting })
      setTickets(prev =>
        prev.map(t => t.ticketid === ticketId ? { ...t, troubleshooting: tempTroubleshooting } : t)
      )
      setEditingTroubleshooting(null)
    } catch (err) {
      console.error('Error updating troubleshooting:', err)
      alert('Failed to update troubleshooting')
    } finally {
      setSavingTicket(null)
    }
  }

  const startEditEndTime = (ticket: Ticket) => {
    setEditingEndTime(ticket.ticketid)
    setTempEndTime(ticket.end_time || '')
  }

  const startEditTroubleshooting = (ticket: Ticket) => {
    setEditingTroubleshooting(ticket.ticketid)
    setTempTroubleshooting(ticket.troubleshooting || '')
  }

  const handleAssistedBySave = async (ticketId: number, webexMessageId?: string | null) => {
    if (!tempAssistedBy.trim()) {
      setEditingAssistedBy(null)
      return
    }
    setSavingTicket(ticketId)
    try {
      await updateTicket(ticketId, { assisted_by: tempAssistedBy })
      setTickets(prev =>
        prev.map(t => t.ticketid === ticketId ? { ...t, assisted_by: tempAssistedBy } : t)
      )

      const msgId = webexMessageId || tickets.find(t => t.ticketid === ticketId)?.webex_message_id
      if (!msgId) {
        console.warn('No Webex Message ID for ticket:', ticketId)
        setEditingAssistedBy(null)
        return
      }
      try {
        const response = await fetch(`/api/webhook/ticket-status?webex_message_id=${encodeURIComponent(msgId)}`)
        if (response.ok) {
          console.log('Webhook triggered successfully for ticket', ticketId, msgId)
        } else {
          const errorBody = await response.text()
          console.warn('Webhook trigger failed:', response.status, response.statusText, errorBody)
        }
      } catch (webhookError) {
        console.error('Webhook trigger network error:', webhookError)
      }
      setEditingAssistedBy(null)
    } catch (err) {
      console.error('Error updating assisted_by:', err)
      alert('Failed to update assisted by')
    } finally {
      setSavingTicket(null)
    }
  }

  const handleAssistedByChange = async (ticketId: number, value: string, webexMessageId: string | null) => {
    if (!value) return
    setSavingTicket(ticketId)
    try {
      await updateTicket(ticketId, { assisted_by: value })
      await fetchTickets()

     if (webexMessageId) {
       try {
         const response = await fetch(`/api/webhook/ticket-status?webex_message_id=${encodeURIComponent(webexMessageId)}`)
         if (response.ok) {
           console.log('Webhook triggered successfully for ticket', ticketId, webexMessageId)
         } else {
           console.warn('Webhook trigger returned non-ok status:', response.status)
         }
       } catch (webhookError) {
         console.error('Webhook trigger failed:', webhookError)
       }
     } else {
       console.warn('No Webex Message ID for ticket:', ticketId)
     }
   } catch (err) {
     console.error('Error updating assisted_by:', err)
     alert('Failed to update assisted by')
   } finally {
     setSavingTicket(null)
   }
  }

  const startEditAssistedBy = (ticket: Ticket) => {
    setEditingAssistedBy(ticket.ticketid)
    setTempAssistedBy(ticket.assisted_by || '')
  }

  const handleAssistedByKeyDown = (e: React.KeyboardEvent, ticketId: number) => {
    if (e.key === 'Enter') {
      handleAssistedBySave(ticketId)
    } else if (e.key === 'Escape') {
      setEditingAssistedBy(null)
    }
  }

  const handleTroubleshootingKeyDown = (e: React.KeyboardEvent, ticketId: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTroubleshootingSave(ticketId)
    } else if (e.key === 'Escape') {
      setEditingTroubleshooting(null)
    }
  }

  const handleEndTimeKeyDown = (e: React.KeyboardEvent, ticketId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEndTimeSave(ticketId)
    } else if (e.key === 'Escape') {
      setEditingEndTime(null)
    }
  }

  const handleTroubleshootingPendingSave = async (ticketId: number, finalize: boolean) => {
    if (!tempTroubleshooting.trim() && !finalize) {
      setTroubleshootingTicket(null)
      return
    }
    setSavingTicket(ticketId)
    try {
      const updates: Partial<Ticket> = { troubleshooting: tempTroubleshooting }
      const ticket = tickets.find(t => t.ticketid === ticketId)
      if (finalize) {
        const now = new Date()
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
        updates.status = 'Resolved'
        updates.end_time = timeStr
      }
      await updateTicket(ticketId, updates)

      if (finalize && ticket?.webex_message_id) {
        try {
          const response = await fetch(`/api/webhook/ticket-resolve?webex_message_id=${encodeURIComponent(ticket.webex_message_id)}`)
          if (response.ok) {
            console.log('Resolve webhook triggered successfully for ticket', ticketId)
          } else {
            console.warn('Resolve webhook returned non-ok status:', response.status)
          }
        } catch (webhookError) {
          console.error('Resolve webhook failed:', webhookError)
        }
      }

      fetchTickets()
      setTroubleshootingTicket(null)
      setShowFinalizeConfirm(false)
    } catch (err) {
      console.error('Error updating troubleshooting:', err)
      alert('Failed to update troubleshooting')
    } finally {
      setSavingTicket(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
            {viewMode === 'it-issues' ? 'IT Tickets' : 'Five9 Logout Issues'}
          </h1>
          <p className="text-on-surface-variant">
            {viewMode === 'it-issues' ? 'View and manage all submitted IT tickets' : 'View Five9 logout records from affected tickets'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* View Switcher */}
          <div className="flex items-center glass-effect rounded-lg p-1">
            <button
              onClick={() => setViewMode('it-issues')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'it-issues'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              IT Issues
            </button>
            <button
              onClick={() => setViewMode('five9-logouts')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'five9-logouts'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Five9 Logout Issues
            </button>
          </div>
          <button
            onClick={() => viewMode === 'it-issues' ? fetchTickets() : fetchFive9LogoutIssues()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all hover:bg-surface-container-high disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glassEffect rounded-xl p-6 backdrop-blur-glass-lg space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Date Range */}
          <div className="flex-1">
            <label className="block text-on-surface text-label-sm font-medium mb-2">Date Range</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
              <div className="relative flex-1">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="block text-on-surface text-label-sm font-medium mb-2">Search</label>
            <div className="flex gap-2">
              <select
                value={searchField}
                onChange={(e) => {
                  setSearchField(e.target.value as SortColumn | '')
                  setSearchQuery('')
                }}
                className="px-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              >
                <option value="">All Fields</option>
                <option value="team_leader">Team Leader</option>
                <option value="name">Agent Name</option>
                <option value="category">Category</option>
                <option value="onsite">Onsite/WFH</option>
                <option value="affected_five9">Five9 Issue</option>
              </select>
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder={searchField ? `Search by ${searchField.replace('_', ' ')}...` : 'Search all...'}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {(dateFrom || dateTo || searchField || searchQuery) && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-sm"
            >
              <X size={16} />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-xl bg-error/10 text-error text-center">{error}</div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-outline-variant/30 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : viewMode === 'it-issues' ? (
        filteredAndSortedTickets.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            No tickets found matching the current filters
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr>
                    {[
                      { key: 'status', label: 'Status', icon: null },
                      { key: 'date', label: 'Date', icon: Calendar },
                      { key: 'team_leader', label: 'Team Leader', icon: Users },
                      { key: 'name', label: 'Agent', icon: User },
                      { key: 'category', label: 'Category', icon: Tag },
                      { key: 'concern', label: 'Concern', icon: null },
                      { key: 'start_time', label: 'Start Time', icon: Clock },
                      { key: 'end_time', label: 'End Time', icon: Clock },
                      { key: 'troubleshooting', label: 'Troubleshooting', icon: Wrench },
                      { key: 'onsite', label: 'Work Setup', icon: Building2 },
                      { key: 'affected_five9', label: 'Five9 Affected', icon: Phone },
                      { key: 'assisted_by', label: 'Assisted by', icon: null },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as SortColumn)}
                        className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors select-none whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.icon && <col.icon size={16} />}
                          <span>{col.label}</span>
                          {getSortIcon(col.key as SortColumn)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {paginatedTickets.map((ticket) => {
                    const status = ticket.status?.toLowerCase() || 'open'
                    const isClickable = status === 'open' || status === 'pending'
                    return (
                      <tr
                        key={ticket.ticketid}
                        className={`hover:bg-surface-container-high/50 transition-colors ${isClickable ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (status === 'open') {
                            setSelectedTicket(ticket)
                            setTempAssistedBy(ticket.assisted_by || '')
                          } else if (status === 'pending') {
                            setTroubleshootingTicket(ticket)
                            setTempTroubleshooting(ticket.troubleshooting || '')
                          }
                        }}
                      >
                        {/* Status */}
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                            {ticket.status || 'Open'}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-sm text-on-surface">
                          {ticket.date ? formatDate(ticket.date) : '-'}
                        </td>

                        {/* Team Leader */}
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.team_leader || '-'}</td>

                        {/* Agent */}
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.name || '-'}</td>

                        {/* Category */}
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.category || '-'}</td>

                        {/* Concern */}
                        <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate" title={ticket.concern || ''}>
                          {ticket.concern || '-'}
                        </td>

                        {/* Start Time */}
                        <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(ticket.start_time)}</td>

                        {/* End Time */}
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono text-on-surface">
                            {ticket.end_time ? formatTime(ticket.end_time) : 'None'}
                          </span>
                        </td>

                        {/* Troubleshooting */}
                        <td className="px-4 py-3 text-sm max-w-xs">
                          <span className="text-on-surface line-clamp-2" title={ticket.troubleshooting || ''}>
                            {ticket.troubleshooting || 'None'}
                          </span>
                        </td>

                        {/* Onsite/WFH */}
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            ticket.onsite ? 'bg-success/20 text-success' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {ticket.onsite ? 'Onsite' : 'WFH'}
                          </span>
                        </td>

                        {/* Five9 Affected */}
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            ticket.affected_five9 ? 'bg-error/20 text-error' : 'bg-success/20 text-success'
                          }`}>
                            {ticket.affected_five9 ? 'Affected' : 'Not Affected'}
                          </span>
                        </td>

                        {/* Assisted By */}
                        <td className="px-4 py-3 text-sm">
                          <span className="text-on-surface">{ticket.assisted_by || 'None'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-on-surface-variant">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, filteredAndSortedTickets.length)} of{' '}
                  {filteredAndSortedTickets.length} tickets
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        const lastPage = totalPages
                        if (page === 1 || page === lastPage) return true
                        return Math.abs(page - currentPage) <= 1
                      })
                      .map((page, idx, arr) => (
                        <span key={page}>
                          {idx > 0 && arr[idx - 1] !== page - 1 && (
                            <span className="px-2 text-on-surface-variant">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                              currentPage === page
                                ? 'bg-primary text-on-primary'
                                : 'hover:bg-surface-container-high text-on-surface'
                            }`}
                          >
                            {page}
                          </button>
                        </span>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <>
          {/* Five9 Logout Issues - Desktop */}
          {five9Logouts.length === 0 ? (
            <div className="text-center py-20 text-on-surface-variant">
              No Five9 logout records found
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={16} />
                        <span>Date</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <User size={16} />
                        <span>Name</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={16} />
                        <span>Logout Time</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={16} />
                        <span>Login Time</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {five9Logouts.map((logout) => (
                    <tr key={logout.id} className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-on-surface">
                        {logout.created_at ? formatDate(logout.created_at) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface">{logout.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(logout.start_time)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(logout.end_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Mobile Cards - IT Issues */}
      {viewMode === 'it-issues' && (
        <div className="md:hidden space-y-4">
          {paginatedTickets.map((ticket) => {
            const status = ticket.status?.toLowerCase()
            const isClickable = status === 'open' || status === 'pending'
            return (
              <div
                key={ticket.ticketid}
                className={`glass-effect rounded-xl p-4 space-y-3 ${isClickable ? 'cursor-pointer hover:bg-surface-container-high/50 transition-colors' : ''}`}
                onClick={() => {
                  if (status === 'open') {
                    setSelectedTicket(ticket)
                    setTempAssistedBy(ticket.assisted_by || '')
                  } else if (status === 'pending') {
                    setTroubleshootingTicket(ticket)
                    setTempTroubleshooting(ticket.troubleshooting || '')
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-hanken text-label-lg font-bold text-on-surface">{ticket.category || 'Unknown'}</p>
                    <p className="text-xs text-on-surface-variant">
                      {ticket.date ? formatDate(ticket.date) : '-'} at {formatTime(ticket.start_time)}
                    </p>
                  </div>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                    {ticket.status || 'Open'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Agent:</span>
                    <span className="text-on-surface">{ticket.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Team Leader:</span>
                    <span className="text-on-surface">{ticket.team_leader || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Start:</span>
                    <span className="font-mono">{formatTime(ticket.start_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">End:</span>
                    <span className="font-mono">{ticket.end_time ? formatTime(ticket.end_time) : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Work Setup:</span>
                    <span className={ticket.onsite ? 'text-success' : 'text-on-surface'}>
                      {ticket.onsite ? 'Onsite' : 'WFH'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Five9 Issue:</span>
                    <span className={ticket.affected_five9 ? 'text-error' : 'text-success'}>
                      {ticket.affected_five9 ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Assisted By:</span>
                    <span className="text-on-surface">{ticket.assisted_by || 'None'}</span>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs mb-1">Concern:</p>
                    <p className="text-on-surface text-sm line-clamp-2">{ticket.concern || 'None'}</p>
                  </div>
                  {ticket.troubleshooting && (
                    <div>
                      <p className="text-on-surface-variant text-xs mb-1">Troubleshooting:</p>
                      <p className="text-on-surface text-sm whitespace-pre-wrap">{ticket.troubleshooting}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mobile Cards - Five9 Logout Issues */}
      {viewMode === 'five9-logouts' && (
        <div className="md:hidden space-y-4">
          {five9Logouts.length === 0 ? (
            <div className="text-center py-20 text-on-surface-variant">No Five9 logout records found</div>
          ) : (
            five9Logouts.map((logout) => (
              <div key={logout.id} className="glass-effect rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-hanken text-label-lg font-bold text-on-surface">{logout.name || 'Unknown'}</p>
                    <p className="text-xs text-on-surface-variant">
                      {logout.created_at ? formatDate(logout.created_at) : '-'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Logout Time:</span>
                    <span className="font-mono">{formatTime(logout.start_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Login Time:</span>
                    <span className="font-mono">{formatTime(logout.end_time)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )

  /* ---------- Modals (same as original) ---------- */

  // ===== Ticket Detail Modal for Open status =====
  const renderTicketDetailModal = () => {
    if (!selectedTicket) return null
    const ticket = selectedTicket
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTicket(null)}>
        <div className="bg-surface rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">Ticket Details</h3>
          <div className="space-y-4">
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Agent</label>
              <p className="text-on-surface">{ticket.name || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Category</label>
              <p className="text-on-surface">{ticket.category || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Concern</label>
              <p className="text-on-surface">{ticket.concern || 'None'}</p>
            </div>
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Assisted By</label>
              <select
                value={tempAssistedBy}
                onChange={(e) => setTempAssistedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm mt-1"
              >
                <option value="">Select...</option>
                {assistedByOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => setSelectedTicket(null)} className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">Cancel</button>
            <button
              onClick={async () => {
                if (tempAssistedBy) {
                  await handleAssistedByChange(ticket.ticketid, tempAssistedBy, ticket.webex_message_id)
                }
                setSelectedTicket(null)
              }}
              disabled={!tempAssistedBy || savingTicket === ticket.ticketid}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Troubleshooting Modal for Pending status =====
  const renderTroubleshootingModal = () => {
    if (!troubleshootingTicket) return null
    const ticket = troubleshootingTicket
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setTroubleshootingTicket(null)}>
        <div className="bg-surface rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">Update Troubleshooting</h3>
          <div className="space-y-4">
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Agent</label>
              <p className="text-on-surface">{ticket.name || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Category</label>
              <p className="text-on-surface">{ticket.category || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-label-sm font-medium text-on-surface-variant">Troubleshooting</label>
              <textarea
                autoFocus
                value={tempTroubleshooting}
                onChange={(e) => setTempTroubleshooting(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                placeholder="Enter troubleshooting steps..."
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setTroubleshootingTicket(null)}
              disabled={savingTicket === ticket.ticketid}
              className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowFinalizeConfirm(true)}
              disabled={savingTicket === ticket.ticketid}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Finalize Confirmation Modal =====
  const renderFinalizeConfirmModal = () => {
    if (!showFinalizeConfirm) return null
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowFinalizeConfirm(false)}>
        <div className="bg-surface rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-2">Finalize Troubleshooting?</h3>
          <p className="text-on-surface-variant mb-4">
            This will mark the ticket as Resolved and set the end time to current time.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setShowFinalizeConfirm(false)
                await handleTroubleshootingPendingSave(troubleshootingTicket!.ticketid, false)
              }}
              disabled={savingTicket === troubleshootingTicket?.ticketid}
              className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              No, just save
            </button>
            <button
              onClick={async () => {
                await handleTroubleshootingPendingSave(troubleshootingTicket!.ticketid, true)
              }}
              disabled={savingTicket === troubleshootingTicket?.ticketid}
              className="flex-1 px-4 py-2 rounded-lg bg-success text-on-success hover:bg-success/90 transition-colors disabled:opacity-50"
            >
              Yes, finalize
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
{/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
            {viewMode === 'it-issues' ? 'IT Tickets' : 'Five9 Logout Issues'}
          </h1>
          <p className="text-on-surface-variant">
            {viewMode === 'it-issues' ? 'View and manage all submitted IT tickets' : 'View Five9 logout records from affected tickets'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* View Switcher */}
          <div className="flex items-center glass-effect rounded-lg p-1">
            <button
              onClick={() => setViewMode('it-issues')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'it-issues'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              IT Issues
            </button>
            <button
              onClick={() => setViewMode('five9-logouts')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'five9-logouts'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Five9 Logout Issues
            </button>
          </div>
          <button
            onClick={() => viewMode === 'it-issues' ? fetchTickets() : fetchFive9LogoutIssues()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all hover:bg-surface-container-high disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-effect rounded-xl p-6 backdrop-blur-glass-lg space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Date Range */}
          <div className="flex-1">
            <label className="block text-on-surface text-label-sm font-medium mb-2">Date Range</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
              <div className="relative flex-1">
                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="block text-on-surface text-label-sm font-medium mb-2">Search</label>
            <div className="flex gap-2">
              <select
                value={searchField}
                onChange={(e) => {
                  setSearchField(e.target.value as SortColumn | '')
                  setSearchQuery('')
                }}
                className="px-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              >
                <option value="">All Fields</option>
                <option value="team_leader">Team Leader</option>
                <option value="name">Agent Name</option>
                <option value="category">Category</option>
                <option value="onsite">Onsite/WFH</option>
                <option value="affected_five9">Five9 Issue</option>
              </select>
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder={searchField ? `Search by ${searchField.replace('_', ' ')}...` : 'Search all...'}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {(dateFrom || dateTo || searchField || searchQuery) && (
          <div className="flex justify-end">
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-sm"
            >
              <X size={16} />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-xl bg-error/10 text-error text-center">{error}</div>
      )}

      {/* Desktop Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-outline-variant/30 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : viewMode === 'it-issues' ? (
        filteredAndSortedTickets.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">No tickets found matching the current filters</div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr>
                    {[
                      { key: 'status', label: 'Status', icon: null },
                      { key: 'date', label: 'Date', icon: Calendar },
                      { key: 'team_leader', label: 'Team Leader', icon: Users },
                      { key: 'name', label: 'Agent', icon: User },
                      { key: 'category', label: 'Category', icon: Tag },
                      { key: 'concern', label: 'Concern', icon: null },
                      { key: 'start_time', label: 'Start Time', icon: Clock },
                      { key: 'end_time', label: 'End Time', icon: Clock },
                      { key: 'troubleshooting', label: 'Troubleshooting', icon: Wrench },
                      { key: 'onsite', label: 'Work Setup', icon: Building2 },
                      { key: 'affected_five9', label: 'Five9 Affected', icon: Phone },
                      { key: 'assisted_by', label: 'Assisted by', icon: null },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as SortColumn)}
                        className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors select-none whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          {col.icon && <col.icon size={16} />}
                          <span>{col.label}</span>
                          {getSortIcon(col.key as SortColumn)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {paginatedTickets.map((ticket) => {
                    const status = ticket.status?.toLowerCase() || 'open'
                    const isClickable = status === 'open' || status === 'pending'
                    return (
                      <tr
                        key={ticket.ticketid}
                        className={`hover:bg-surface-container-high/50 transition-colors ${isClickable ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (status === 'open') {
                            setSelectedTicket(ticket)
                            setTempAssistedBy(ticket.assisted_by || '')
                          } else if (status === 'pending') {
                            setTroubleshootingTicket(ticket)
                            setTempTroubleshooting(ticket.troubleshooting || '')
                          }
                        }}
                      >
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                            {ticket.status || 'Open'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.date ? formatDate(ticket.date) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.team_leader || '-'}</td>
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-on-surface">{ticket.category || '-'}</td>
                        <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate" title={ticket.concern || ''}>{ticket.concern || '-'}</td>
                        <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(ticket.start_time)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono text-on-surface">{ticket.end_time ? formatTime(ticket.end_time) : 'None'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs">
                          <span className="text-on-surface line-clamp-2" title={ticket.troubleshooting || ''}>{ticket.troubleshooting || 'None'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            ticket.onsite ? 'bg-success/20 text-success' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {ticket.onsite ? 'Onsite' : 'WFH'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            ticket.affected_five9 ? 'bg-error/20 text-error' : 'bg-success/20 text-success'
                          }`}>
                            {ticket.affected_five9 ? 'Affected' : 'Not Affected'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="text-on-surface">{ticket.assisted_by || 'None'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-on-surface-variant">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, filteredAndSortedTickets.length)} of{' '}
                  {filteredAndSortedTickets.length} tickets
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        const lastPage = totalPages
                        if (page === 1 || page === lastPage) return true
                        return Math.abs(page - currentPage) <= 1
                      })
                      .map((page, idx, arr) => (
                        <span key={page}>
                          {idx > 0 && arr[idx - 1] !== page - 1 && (
                            <span className="px-2 text-on-surface-variant">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                              currentPage === page
                                ? 'bg-primary text-on-primary'
                                : 'hover:bg-surface-container-high text-on-surface'
                            }`}
                          >
                            {page}
                          </button>
                        </span>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <>
          {/* Five9 Logout Issues - Desktop */}
          {five9Logouts.length === 0 ? (
            <div className="text-center py-20 text-on-surface-variant">No Five9 logout records found</div>
          ) : (
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><Calendar size={16} /><span>Date</span></div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><User size={16} /><span>Name</span></div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><Clock size={16} /><span>Logout Time</span></div>
                    </th>
                    <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><Clock size={16} /><span>Login Time</span></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {five9Logouts.map((logout) => (
                    <tr key={logout.id} className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-on-surface">{logout.created_at ? formatDate(logout.created_at) : '-'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface">{logout.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(logout.start_time)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface font-mono">{formatTime(logout.end_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Mobile Cards - IT Issues */}
      {viewMode === 'it-issues' && (
        <div className="md:hidden space-y-4">
          {paginatedTickets.map((ticket) => {
            const status = ticket.status?.toLowerCase()
            const isClickable = status === 'open' || status === 'pending'
            return (
              <div
                key={ticket.ticketid}
                className={`glass-effect rounded-xl p-4 space-y-3 ${isClickable ? 'cursor-pointer hover:bg-surface-container-high/50 transition-colors' : ''}`}
                onClick={() => {
                  if (status === 'open') {
                    setSelectedTicket(ticket)
                    setTempAssistedBy(ticket.assisted_by || '')
                  } else if (status === 'pending') {
                    setTroubleshootingTicket(ticket)
                    setTempTroubleshooting(ticket.troubleshooting || '')
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-hanken text-label-lg font-bold text-on-surface">{ticket.category || 'Unknown'}</p>
                    <p className="text-xs text-on-surface-variant">
                      {ticket.date ? formatDate(ticket.date) : '-'} at {formatTime(ticket.start_time)}
                    </p>
                  </div>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                    {ticket.status || 'Open'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Agent:</span>
                    <span className="text-on-surface">{ticket.name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Team Leader:</span>
                    <span className="text-on-surface">{ticket.team_leader || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Start:</span>
                    <span className="font-mono">{formatTime(ticket.start_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">End:</span>
                    <span className="font-mono">{ticket.end_time ? formatTime(ticket.end_time) : 'None'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Work Setup:</span>
                    <span className={ticket.onsite ? 'text-success' : 'text-on-surface'}>
                      {ticket.onsite ? 'Onsite' : 'WFH'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Five9 Issue:</span>
                    <span className={ticket.affected_five9 ? 'text-error' : 'text-success'}>
                      {ticket.affected_five9 ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Assisted By:</span>
                    <span className="text-on-surface">{ticket.assisted_by || 'None'}</span>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs mb-1">Concern:</p>
                    <p className="text-on-surface text-sm line-clamp-2">{ticket.concern || 'None'}</p>
                  </div>
                  {ticket.troubleshooting && (
                    <div>
                      <p className="text-on-surface-variant text-xs mb-1">Troubleshooting:</p>
                      <p className="text-on-surface text-sm whitespace-pre-wrap">{ticket.troubleshooting}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mobile Cards - Five9 Logout Issues */}
      {viewMode === 'five9-logouts' && (
        <div className="md:hidden space-y-4">
          {five9Logouts.length === 0 ? (
            <div className="text-center py-20 text-on-surface-variant">No Five9 logout records found</div>
          ) : (
            five9Logouts.map((logout) => (
              <div key={logout.id} className="glass-effect rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-hanken text-label-lg font-bold text-on-surface">{logout.name || 'Unknown'}</p>
                    <p className="text-xs text-on-surface-variant">{logout.created_at ? formatDate(logout.created_at) : '-'}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Logout Time:</span>
                    <span className="font-mono">{formatTime(logout.start_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Login Time:</span>
                    <span className="font-mono">{formatTime(logout.end_time)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Ticket Detail Modal for Open status */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTicket(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">Ticket Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Agent</label>
                <p className="text-on-surface">{selectedTicket!.name || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Category</label>
                <p className="text-on-surface">{selectedTicket!.category || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Concern</label>
                <p className="text-on-surface">{selectedTicket!.concern || 'None'}</p>
              </div>
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Assisted By</label>
                <select
                  value={tempAssistedBy}
                  onChange={(e) => setTempAssistedBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm mt-1"
                >
                  <option value="">Select...</option>
                  {assistedByOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setSelectedTicket(null)} className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  if (tempAssistedBy) {
                    await handleAssistedByChange(selectedTicket!.ticketid, tempAssistedBy, selectedTicket!.webex_message_id)
                  }
                  setSelectedTicket(null)
                }}
                disabled={!tempAssistedBy || savingTicket === selectedTicket!.ticketid}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Troubleshooting Modal for Pending status */}
      {troubleshootingTicket && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setTroubleshootingTicket(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">Update Troubleshooting</h3>
            <div className="space-y-4">
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Agent</label>
                <p className="text-on-surface">{troubleshootingTicket!.name || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Category</label>
                <p className="text-on-surface">{troubleshootingTicket!.category || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-label-sm font-medium text-on-surface-variant">Troubleshooting</label>
                <textarea
                  autoFocus
                  value={tempTroubleshooting}
                  onChange={(e) => setTempTroubleshooting(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm resize-none"
                  placeholder="Enter troubleshooting steps..."
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setTroubleshootingTicket(null)}
                disabled={savingTicket === troubleshootingTicket!.ticketid}
                className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowFinalizeConfirm(true)}
                disabled={savingTicket === troubleshootingTicket!.ticketid}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowFinalizeConfirm(false)}>
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-2">Finalize Troubleshooting?</h3>
            <p className="text-on-surface-variant mb-4">
              This will mark the ticket as Resolved and set the end time to current time.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setShowFinalizeConfirm(false)
                  await handleTroubleshootingPendingSave(troubleshootingTicket!.ticketid, false)
                }}
                disabled={savingTicket === troubleshootingTicket?.ticketid}
                className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                No, just save
              </button>
              <button
                onClick={async () => {
                  await handleTroubleshootingPendingSave(troubleshootingTicket!.ticketid, true)
                }}
                disabled={savingTicket === troubleshootingTicket?.ticketid}
                className="flex-1 px-4 py-2 rounded-lg bg-success text-on-success hover:bg-success/90 transition-colors disabled:opacity-50"
              >
                Yes, finalize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
