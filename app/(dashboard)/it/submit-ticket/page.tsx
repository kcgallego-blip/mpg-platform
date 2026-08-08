'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Users, X } from 'lucide-react'
import { showITTicketSuccessToast } from '@/components/ITTicketSuccessToast'
import { createTicket, getAllAgentNames } from '@/lib/db'
import { createSubmissionHistory, type TicketHistoryEntry } from '@/lib/ticketAudit'
import { useAuthStore } from '@/lib/authStore'

type AgentOption = {
  name: string
}

type SubmissionMode = 'single' | 'batch'

type TicketItem = {
  agentNames: string[]
  category: string
  concern: string
  startTime: string
  startAmPm: 'AM' | 'PM'
  affectsFive9: boolean
}

type TicketFieldValue = string | boolean | string[]

type TicketPayload = {
  category: string
  concern: string
  date: string
  start_time: string
  name: string
  onsite: boolean
  affected_five9: boolean
  webex_message_id: null
  end_time: null
  troubleshooting: null
  assisted_by: null
  status: string
  history: TicketHistoryEntry[]
  notes: []
}

const categories = [
  'Hardware',
  'Internet Connection',
  'Zendesk',
  'Five9',
  'Google',
  'Credentials',
  'Others',
]

function createEmptyTicketItem(): TicketItem {
  const now = new Date()
  let hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12

  return {
    agentNames: [],
    category: '',
    concern: '',
    startTime: `${hours.toString().padStart(2, '0')}:${minutes}`,
    startAmPm: ampm as 'AM' | 'PM',
    affectsFive9: false,
  }
}

function convertTo24Hour(time: string, amPm: TicketItem['startAmPm']) {
  const [hourValue, minute] = time.trim().split(':')
  let hour = Number(hourValue)

  if (amPm === 'PM' && hour !== 12) hour += 12
  if (amPm === 'AM' && hour === 12) hour = 0

  return `${hour.toString().padStart(2, '0')}:${minute}`
}

function buildTicketData(
  item: TicketItem,
  affectedAgent: string,
  submittedBy: string,
  now = new Date()
): TicketPayload {
  return {
    category: item.category,
    concern: item.concern.trim(),
    date: now.toISOString().split('T')[0],
    start_time: convertTo24Hour(item.startTime, item.startAmPm),
    name: affectedAgent,
    onsite: true,
    affected_five9: item.affectsFive9,
    webex_message_id: null,
    end_time: null,
    troubleshooting: null,
    assisted_by: null,
    status: 'Open',
    history: createSubmissionHistory(submittedBy, now.toISOString()),
    notes: [],
  }
}

function isValidTime(value: string) {
  return /^(0?[1-9]|1[0-2]):[0-5][0-9]$/.test(value.trim())
}

function ModeSelector({
  value,
  onChange,
}: {
  value: SubmissionMode
  onChange: (mode: SubmissionMode) => void
}) {
  const modes: Array<{
    value: SubmissionMode
    label: string
    description: string
    output: string
  }> = [
    {
      value: 'single',
      label: 'Single Submission',
      description: 'Report one issue affecting one or more agents.',
      output: 'Creates one ticket row per selected agent.',
    },
    {
      value: 'batch',
      label: 'Batch Report',
      description: 'Report one shared issue affecting at least two agents.',
      output: 'Creates one combined ticket row.',
    },
  ]

  return (
    <fieldset>
      <legend className="mb-3 font-hanken text-label-md font-semibold text-on-surface">
        Submission Mode
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((mode) => {
          const selected = value === mode.value

          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(mode.value)}
              className={`rounded-xl border p-4 text-left transition-all ${
                selected
                  ? 'border-primary bg-primary-container/15 ring-2 ring-primary/15'
                  : 'border-outline-variant/50 bg-surface-container-low/30 hover:border-primary/50 hover:bg-surface-container-low'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full border ${
                    selected
                      ? 'border-primary bg-primary ring-2 ring-primary/20'
                      : 'border-outline'
                  }`}
                />
                <span className="font-hanken font-semibold text-on-surface">
                  {mode.label}
                </span>
              </span>
              <span className="mt-3 block text-sm text-on-surface-variant">
                {mode.description}
              </span>
              <span className="mt-2 block text-xs font-medium text-primary">
                {mode.output}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function AgentSelector({
  item,
  minimumAgents,
  allAgents,
  loadingAgents,
  onItemChange,
}: {
  item: TicketItem
  minimumAgents: number
  allAgents: AgentOption[]
  loadingAgents: boolean
  onItemChange: (field: keyof TicketItem, value: TicketFieldValue) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredAgents = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase()

    return allAgents.filter(
      (agent) =>
        !item.agentNames.includes(agent.name) &&
        (!normalizedSearchTerm || agent.name.toLowerCase().includes(normalizedSearchTerm))
    )
  }, [allAgents, item.agentNames, searchTerm])

  const handleAgentSelect = (agentName: string) => {
    const nextAgentNames = item.agentNames.includes(agentName)
      ? item.agentNames.filter((name) => name !== agentName)
      : [...item.agentNames, agentName]

    onItemChange('agentNames', nextAgentNames)
    setSearchTerm('')
  }

  const handleRemoveAgent = (agentName: string) => {
    onItemChange(
      'agentNames',
      item.agentNames.filter((name) => name !== agentName)
    )
  }

  const handleChange = (field: keyof TicketItem, value: TicketFieldValue) => {
    onItemChange(field, value)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanken text-label-md font-semibold text-on-surface">
            Affected Agents
          </h3>
          <p className="text-on-surface-variant text-sm">
            {item.agentNames.length === 0
              ? `Select at least ${minimumAgents === 1 ? 'one agent' : `${minimumAgents} agents`}.`
              : item.agentNames.length < minimumAgents
                ? `Select ${minimumAgents - item.agentNames.length} more agent${minimumAgents - item.agentNames.length === 1 ? '' : 's'} to submit this batch.`
                : `${item.agentNames.length} agent${item.agentNames.length === 1 ? '' : 's'} selected.`}
          </p>
        </div>
        {item.agentNames.length > 0 && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            {item.agentNames.length} selected
          </span>
        )}
      </div>

      <div>
        <label className="block text-on-surface text-label-md font-medium mb-3">
          Agent Name(s) <span className="text-error">*</span>
        </label>

        {item.agentNames.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {item.agentNames.map((agent) => (
              <div
                key={agent}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 text-sm"
              >
                {agent}
                <button
                  type="button"
                  onClick={() => handleRemoveAgent(agent)}
                  className="hover:text-primary transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {loadingAgents ? (
          <div className="w-full px-4 py-3 rounded-lg bg-surface-container-low/50 flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-primary" />
            <span className="text-on-surface-variant">Loading agents...</span>
          </div>
        ) : (
          <div ref={dropdownRef} className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              <Users size={18} />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
              placeholder="Search agents..."
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            {showDropdown && (
              <div className="absolute z-20 w-full mt-1 max-h-60 overflow-auto glass-effect rounded-lg shadow-lg p-2">
                {filteredAgents.length > 0 ? (
                  filteredAgents.map((agent) => (
                    <button
                      key={agent.name}
                      type="button"
                      onClick={() => handleAgentSelect(agent.name)}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface"
                    >
                      <span>{agent.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-on-surface-variant">
                    No matching agents found.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-on-surface text-label-md font-medium mb-3">
          Start Time <span className="text-error">*</span>
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={item.startTime}
            onChange={(e) => handleChange('startTime', e.target.value)}
            placeholder="HH:MM"
            className="flex-1 px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
          <select
            value={item.startAmPm}
            onChange={(e) => handleChange('startAmPm', e.target.value)}
            className="px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          >
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-on-surface text-label-md font-medium mb-3">
          Category of Issue <span className="text-error">*</span>
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleChange('category', cat)}
              className={`p-3 rounded-lg transition-all text-center ${
                item.category === cat
                  ? 'bg-primary-container/20'
                  : 'hover:bg-surface-container-high'
              }`}
            >
              <span className="font-hanken text-label-sm font-medium text-on-surface">
                {cat}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-on-surface text-label-md font-medium mb-3">
          Detailed Notes <span className="text-error">*</span>
        </label>
        <textarea
          required
          value={item.concern}
          onChange={(e) => handleChange('concern', e.target.value)}
          rows={6}
          className="w-full px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
          placeholder="Please provide detailed information about the issue..."
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={item.affectsFive9}
          onChange={(e) => handleChange('affectsFive9', e.target.checked)}
          className="w-5 h-5 mt-0.5 rounded border-outline-variant/50 text-primary focus:ring-2 focus:ring-primary/20 transition-all"
        />
        <span className="text-on-surface group-hover:text-primary transition-colors">
          Is the issue affecting the agent's Five9 login hours?
        </span>
      </label>
    </div>
  )
}

export default function ITReportPage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('single')
  const [formData, setFormData] = useState<TicketItem>(() => createEmptyTicketItem())
  const [allAgents, setAllAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(true)

  useEffect(() => {
    async function fetchAgents() {
      try {
        setLoadingAgents(true)
        const agents = await getAllAgentNames()
        setAllAgents(agents)
      } catch (error) {
        console.error('Error fetching agents:', error)
      } finally {
        setLoadingAgents(false)
      }
    }
    fetchAgents()
  }, [])

  const handleItemChange = (field: keyof TicketItem, value: TicketFieldValue) => {
    setFormData((prev) => ({ ...prev, [field]: value } as TicketItem))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const minimumAgents = submissionMode === 'batch' ? 2 : 1

    if (formData.agentNames.length < minimumAgents) {
      alert(
        submissionMode === 'batch'
          ? 'Please select at least two agents for a batch report.'
          : 'Please select at least one agent.'
      )
      return
    }

    const validationErrors: string[] = []

    if (!formData.category.trim()) {
      validationErrors.push('select an issue category')
    }
    if (!formData.concern.trim()) {
      validationErrors.push('enter detailed notes')
    }
    if (!isValidTime(formData.startTime)) {
      validationErrors.push('enter a valid start time in HH:MM format')
    }

    if (validationErrors.length > 0) {
      alert(`Please ${validationErrors.join(', and ')}.`)
      return
    }

    setLoading(true)

    try {
      const now = new Date()
      const submittedBy = user?.name?.trim() || user?.email?.trim()
      if (!submittedBy) {
        throw new Error('Unable to identify the logged-in user. Please sign in again.')
      }
      const createdTickets: Awaited<ReturnType<typeof createTicket>>[] = []

      if (submissionMode === 'batch') {
        const batchTicket = buildTicketData(
          formData,
          formData.agentNames.join(', '),
          submittedBy,
          now
        )

        console.log('Submitting batch ticket data:', batchTicket)
        createdTickets.push(await createTicket(batchTicket))
      } else {
        for (const agentName of formData.agentNames) {
          const ticket = buildTicketData(formData, agentName, submittedBy, now)
          console.log('Submitting ticket data:', ticket)
          createdTickets.push(await createTicket(ticket))
        }
      }

      const reportLabel = createdTickets.length === 1 ? 'IT Report' : 'IT Reports'
      showITTicketSuccessToast(
        `${createdTickets.length} ${reportLabel} submitted successfully.`
      )
      router.push('/it/ticket-reports')
    } catch (error: any) {
      console.error('Error creating ticket:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      alert(`Failed to submit IT report: ${error.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
          Submit IT Report
        </h1>
        <p className="text-on-surface-variant">
          Report any technical issues you're experiencing. Our IT team will assist you promptly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <ModeSelector
          value={submissionMode}
          onChange={setSubmissionMode}
        />

        <div className="space-y-8">
          <AgentSelector
            item={formData}
            minimumAgents={submissionMode === 'batch' ? 2 : 1}
            allAgents={allAgents}
            loadingAgents={loadingAgents}
            onItemChange={handleItemChange}
          />
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/staffing')}
            className="flex-1 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-2 px-lg py-md rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-lg hover:shadow-primary-container/30 text-on-primary font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
            {loading
              ? 'Submitting...'
              : submissionMode === 'batch'
                ? 'Submit Batch Report'
                : 'Submit Report'}
          </button>
        </div>
      </form>

    </div>
  )
}
