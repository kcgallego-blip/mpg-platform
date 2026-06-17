'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Users, X, Plus, Trash2 } from 'lucide-react'
import { createTicket, getAllAgentsWithSettings } from '@/lib/db'

type AgentWorkSetting = string | null | undefined
type AgentOption = {
  name: string
  setting: AgentWorkSetting
}

type TicketItem = {
  id: string
  agentNames: string[]
  category: string
  concern: string
  startTime: string
  startAmPm: 'AM' | 'PM'
  isOnsite: boolean
  affectsFive9: boolean
}

type TicketFieldValue = string | boolean | string[]

type TicketPayload = {
  category: string
  concern: string
  date: string
  start_time: string
  onsite: boolean
  affected_five9: boolean
  webex_message_id: null
  end_time: null
  troubleshooting: null
  assisted_by: null
  status: string
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
    id: crypto.randomUUID(),
    agentNames: [],
    category: '',
    concern: '',
    startTime: `${hours.toString().padStart(2, '0')}:${minutes}`,
    startAmPm: ampm as 'AM' | 'PM',
    isOnsite: false,
    affectsFive9: false,
  }
}

function buildTicketData(item: TicketItem, now = new Date()): TicketPayload {
  return {
    category: item.category,
    concern: item.concern.trim(),
    date: now.toISOString().split('T')[0],
    start_time: item.startTime,
    onsite: item.isOnsite,
    affected_five9: item.affectsFive9,
    webex_message_id: null,
    end_time: null,
    troubleshooting: null,
    assisted_by: null,
    status: 'Open',
  }
}

function buildBatchConcern(items: TicketItem[], now: Date) {
  return JSON.stringify(
    {
      mode: 'batch',
      submittedAt: now.toISOString(),
      itemCount: items.length,
      items: items.map((item) => ({
        agentNames: item.agentNames,
        category: item.category,
        concern: item.concern.trim(),
        start_time: item.startTime,
        start_am_pm: item.startAmPm,
        isOnsite: item.isOnsite,
        affectsFive9: item.affectsFive9,
      })),
    },
    null,
    2
  )
}

function isWfhAgent(agent: AgentOption) {
  return !agent.setting || agent.setting.trim() === ''
}

function getAgentSettingLabel(setting: AgentWorkSetting) {
  return setting === 'O' ? 'Onsite' : 'WFH'
}

function getAgentSettingClass(setting: AgentWorkSetting) {
  return setting === 'O'
    ? 'bg-primary-container/20 text-primary border-primary/30'
    : 'bg-surface-container-high text-on-surface-variant border-outline-variant/40'
}

function isValidTime(value: string) {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value.trim())
}

function isInvalidTicketItem(item: TicketItem) {
  return (
    item.agentNames.length === 0 ||
    item.category.trim().length === 0 ||
    item.concern.trim().length === 0 ||
    !isValidTime(item.startTime)
  )
}

function ModeToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-hanken text-label-md font-semibold text-on-surface">
            Submission Mode
          </h2>
          <p className="mt-1 text-on-surface-variant text-sm">
            {enabled
              ? 'Batch reporting saves all report items below as one JSON payload row.'
              : 'Single mode creates one ticket row for each selected agent.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-primary-container' : 'bg-surface-container-high'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-on-primary shadow transition-transform ${
              enabled ? 'translate-x-9' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span
          className={`rounded-full border px-3 py-1 ${
            !enabled
              ? 'border-primary/50 bg-primary-container/20 text-primary'
              : 'border-outline-variant/50 text-on-surface-variant'
          }`}
        >
          Single Submission Mode
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${
            enabled
              ? 'border-primary/50 bg-primary-container/20 text-primary'
              : 'border-outline-variant/50 text-on-surface-variant'
          }`}
        >
          Batch Report
        </span>
      </div>
    </div>
  )
}

function AgentSelector({
  item,
  itemLabel,
  allAgents,
  loadingAgents,
  onsiteAgents,
  wfhAgents,
  onItemChange,
}: {
  item: TicketItem
  itemLabel: string
  allAgents: AgentOption[]
  loadingAgents: boolean
  onsiteAgents: AgentOption[]
  wfhAgents: AgentOption[]
  onItemChange: (field: keyof TicketItem, value: TicketFieldValue) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const dropdownRef = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) {
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

  const selectAgents = (agents: AgentOption[]) => {
    if (agents.length === 0) return

    onItemChange(
      'agentNames',
      Array.from(new Set([...item.agentNames, ...agents.map((agent) => agent.name)]))
    )
    setSearchTerm('')
    setShowDropdown(false)
  }

  const handleChange = (field: keyof TicketItem, value: TicketFieldValue) => {
    onItemChange(field, value)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-hanken text-label-md font-semibold text-on-surface">
            {itemLabel}
          </h3>
          <p className="text-on-surface-variant text-sm">
            {item.agentNames.length === 0
              ? 'Select at least one agent for this report item.'
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

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => selectAgents(onsiteAgents)}
            disabled={onsiteAgents.length === 0}
            className="rounded-lg border border-primary/40 bg-primary-container/15 px-3 py-2 text-sm font-medium text-primary transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select All Onsite Agents ({onsiteAgents.length})
          </button>
          <button
            type="button"
            onClick={() => selectAgents(wfhAgents)}
            disabled={wfhAgents.length === 0}
            className="rounded-lg border border-outline-variant/60 bg-surface-container-high px-3 py-2 text-sm font-medium text-on-surface transition-all hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select All WFH Agents ({wfhAgents.length})
          </button>
        </div>

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
                      <span
                        className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${getAgentSettingClass(
                          agent.setting
                        )}`}
                      >
                        {getAgentSettingLabel(agent.setting)}
                      </span>
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

      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={item.isOnsite}
            onChange={(e) => handleChange('isOnsite', e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-outline-variant/50 text-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
          <span className="text-on-surface group-hover:text-primary transition-colors">
            Agent is onsite (uncheck if WFH)
          </span>
        </label>

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
    </div>
  )
}

export default function ITReportPage() {
  const router = useRouter()
  const [batchReporting, setBatchReporting] = useState(false)
  const [formData, setFormData] = useState<TicketItem>(() => createEmptyTicketItem())
  const [batchItems, setBatchItems] = useState<TicketItem[]>([])
  const [allAgents, setAllAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(true)

  const onsiteAgents = useMemo(
    () => allAgents.filter((agent) => agent.setting === 'O'),
    [allAgents]
  )
  const wfhAgents = useMemo(() => allAgents.filter(isWfhAgent), [allAgents])

  useEffect(() => {
    async function fetchAgents() {
      try {
        setLoadingAgents(true)
        const agents = await getAllAgentsWithSettings()
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

  const handleBatchItemChange = (
    itemId: string,
    field: keyof TicketItem,
    value: TicketFieldValue
  ) => {
    setBatchItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? ({ ...item, [field]: value } as TicketItem) : item
      )
    )
  }

  const addBatchItem = () => {
    setBatchItems((prev) => [...prev, createEmptyTicketItem()])
  }

  const removeBatchItem = (itemId: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const itemsToSubmit = batchReporting ? [formData, ...batchItems] : [formData]
    const invalidItems = itemsToSubmit.filter(isInvalidTicketItem)

    if (invalidItems.length > 0) {
      const invalidItemNumbers = invalidItems
        .map((_, index) => index + 1)
        .join(', ')
      alert(
        `Please complete all required fields for Report Item ${invalidItemNumbers}.`
      )
      return
    }

    setLoading(true)

    try {
      const now = new Date()
      const createdTickets: Awaited<ReturnType<typeof createTicket>>[] = []

      if (batchReporting) {
        const batchTicket = {
          ...buildTicketData(formData, now),
          name: 'Batch Report',
          category: 'Batch',
          concern: buildBatchConcern(itemsToSubmit, now),
        }

        console.log('Submitting batch ticket data:', batchTicket)
        createdTickets.push(await createTicket(batchTicket))
      } else {
        const ticketData = buildTicketData(formData, now)

        for (const agentName of formData.agentNames) {
          const ticket = { ...ticketData, name: agentName }
          console.log('Submitting ticket data:', ticket)
          createdTickets.push(await createTicket(ticket))
        }
      }

      const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL
      if (webhookUrl) {
        for (const result of createdTickets) {
          try {
            const ticketId = result.ticketid
            const webhookEndpoint = `${webhookUrl}/api/ticket/message?id=${ticketId}`
            console.log('Calling webhook:', webhookEndpoint)

            const response = await fetch(webhookEndpoint, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            })

            if (response.ok) {
              console.log('Webhook called successfully')
            } else {
              console.warn('Webhook returned non-ok status:', response.status)
            }
          } catch (webhookError) {
            console.error('Webhook call failed:', webhookError)
          }
        }
      } else {
        console.warn('WEBHOOK_URL environment variable not set')
      }

      const reportLabel = createdTickets.length === 1 ? 'IT Report' : 'IT Reports'
      alert(`${createdTickets.length} ${reportLabel} submitted successfully!`)
      router.push('/dashboard')
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
        <ModeToggle
          enabled={batchReporting}
          onToggle={() => setBatchReporting((prev) => !prev)}
        />

        <div className="space-y-8">
          <AgentSelector
            item={formData}
            itemLabel="Report Item 1"
            allAgents={allAgents}
            loadingAgents={loadingAgents}
            onsiteAgents={onsiteAgents}
            wfhAgents={wfhAgents}
            onItemChange={handleItemChange}
          />

          {batchReporting && (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-hanken text-label-md font-semibold text-on-surface">
                    Additional Report Items
                  </h2>
                  <p className="text-on-surface-variant text-sm">
                    Add more issues here. They will be saved together in one batch row.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBatchItem}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-sm font-medium text-on-primary transition-all hover:shadow-lg hover:shadow-primary-container/30"
                >
                  <Plus size={16} />
                  Add Report Item
                </button>
              </div>

              <div className="space-y-6">
                {batchItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-outline-variant/50 bg-surface-container-low/30 p-4 sm:p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-hanken text-label-md font-semibold text-on-surface">
                          Report Item {index + 2}
                        </h3>
                        <p className="text-on-surface-variant text-sm">
                          Configure another issue to include in this batch.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBatchItem(item.id)}
                        className="rounded-lg p-2 text-error transition-colors hover:bg-error/10"
                        aria-label={`Remove Report Item ${index + 2}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <AgentSelector
                      item={item}
                      itemLabel={`Report Item ${index + 2}`}
                      allAgents={allAgents}
                      loadingAgents={loadingAgents}
                      onsiteAgents={onsiteAgents}
                      wfhAgents={wfhAgents}
                      onItemChange={(field, value) =>
                        handleBatchItemChange(item.id, field, value)
                      }
                    />
                  </div>
                ))}

                {batchItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-outline-variant/60 p-4 text-center text-on-surface-variant">
                    No additional report items yet. Add one if you need multiple issues in this batch.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
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
            {loading ? 'Submitting...' : batchReporting ? 'Submit Batch Report' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  )
}
