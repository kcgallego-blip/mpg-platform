'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Users, X } from 'lucide-react'
import { createTicket, getAllAgents } from '@/lib/db'

export default function ITReportPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    agentNames: [] as string[],
    category: '',
    concern: '',
    startTime: '',
    startAmPm: 'AM',
    isOnsite: false,
    affectsFive9: false,
  })
  const [allAgents, setAllAgents] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingAgents, setLoadingAgents] = useState(true)

  // Initialize start time when page loads
  useEffect(() => {
    const now = new Date()
    let hours = now.getHours()
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    const startTime = `${hours.toString().padStart(2, '0')}:${minutes}`
    
    setFormData(prev => ({
      ...prev,
      startTime,
      startAmPm: ampm
    }))
  }, [])

  // Close dropdown when clicking outside
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

  const handleAgentSelect = (agent: string) => {
    setFormData((prev) => {
      const agentNames = prev.agentNames.includes(agent)
        ? prev.agentNames.filter((a) => a !== agent)
        : [...prev.agentNames, agent]
      return { ...prev, agentNames }
    })
    setSearchTerm('')
  }

  const handleRemoveAgent = (agent: string) => {
    setFormData((prev) => ({
      ...prev,
      agentNames: prev.agentNames.filter((a) => a !== agent),
    }))
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

  // Fetch all agents on mount
  useEffect(() => {
    async function fetchAgents() {
      try {
        setLoadingAgents(true)
        const agentNames = await getAllAgents()
        setAllAgents(agentNames)
      } catch (error) {
        console.error('Error fetching agents:', error)
      } finally {
        setLoadingAgents(false)
      }
    }
    fetchAgents()
  }, [])

  // Filter agents by search term and exclude already selected agents
  const filteredAgents = useMemo(() => {
    if (!searchTerm) return allAgents.filter(agent => !formData.agentNames.includes(agent))
    return allAgents.filter((agent) =>
      agent.toLowerCase().includes(searchTerm.toLowerCase()) && !formData.agentNames.includes(agent)
    )
  }, [allAgents, searchTerm, formData.agentNames])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.agentNames.length === 0) {
      alert('Please select at least one agent')
      return
    }
    setLoading(true)

    try {
      const now = new Date()

      const ticketData = {
        category: formData.category,
        concern: formData.concern,
        date: now.toISOString().split('T')[0],
        start_time: formData.startTime,
        onsite: formData.isOnsite,
        affected_five9: formData.affectsFive9,
        webex_message_id: null,
        end_time: null,
        troubleshooting: null,
        assisted_by: null,
        status: 'Open',
      }

      const createdTickets = []
      for (const agentName of formData.agentNames) {
        const ticket = { ...ticketData, name: agentName }
        console.log('Submitting ticket data:', ticket)
        const result = await createTicket(ticket)
        createdTickets.push(result)
      }

      // Trigger webhook for each ticket
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

      alert(`${createdTickets.length} IT Report(s) submitted successfully!`)
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error creating ticket:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      alert(`Failed to submit IT report: ${error.message || 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
          Submit IT Report
        </h1>
        <p className="text-on-surface-variant">
          Report any technical issues you're experiencing. Our IT team will assist you promptly.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Agent Name Dropdown (Searchable, Multi-select) */}
        <div>
          <label className="block text-on-surface text-label-md font-medium mb-3">
            Agent Name(s) <span className="text-error">*</span>
          </label>
          
          {/* Selected Agents Tags */}
          {formData.agentNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.agentNames.map((agent) => (
                <div
                  key={agent}
                  className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary-container/20 text-primary-container text-sm"
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
                placeholder="Search agents..."
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {showDropdown && filteredAgents.length > 0 && (
                <div className="absolute z-10 w-full mt-1 max-h-60 overflow-auto glass-effect rounded-lg shadow-lg p-2">
                  {filteredAgents.map((agent) => (
                    <button
                      key={agent}
                      type="button"
                      onClick={() => handleAgentSelect(agent)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface"
                    >
                      {agent}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Start Time */}
        <div>
          <label className="block text-on-surface text-label-md font-medium mb-3">
            Start Time <span className="text-error">*</span>
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={formData.startTime}
              onChange={(e) => handleChange('startTime', e.target.value)}
              placeholder="HH:MM"
              className="flex-1 px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <select
              value={formData.startAmPm}
              onChange={(e) => handleChange('startAmPm', e.target.value)}
              className="px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>

        {/* Issue Category */}
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
                  formData.category === cat
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

        {/* Description / Notes */}
        <div>
          <label className="block text-on-surface text-label-md font-medium mb-3">
            Detailed Notes <span className="text-error">*</span>
          </label>
          <textarea
            required
            value={formData.concern}
            onChange={(e) => handleChange('concern', e.target.value)}
            rows={6}
            className="w-full px-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
            placeholder="Please provide detailed information about the issue..."
          />
        </div>

        {/* Checkboxes */}
        <div className="space-y-4">
          {/* Onsite Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={formData.isOnsite}
              onChange={(e) => handleChange('isOnsite', e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-outline-variant/50 text-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <span className="text-on-surface group-hover:text-primary transition-colors">
              Agent is onsite (uncheck if WFH)
            </span>
          </label>

          {/* Five9 Affecting Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={formData.affectsFive9}
              onChange={(e) => handleChange('affectsFive9', e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-outline-variant/50 text-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <span className="text-on-surface group-hover:text-primary transition-colors">
              Is the issue affecting your Five9 login hours?
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex-1 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all"
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
            {loading ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </form>
    </div>
  )
}