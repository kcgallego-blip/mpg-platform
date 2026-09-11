'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, UserRoundSearch } from 'lucide-react'
import AgentCalendarView from './AgentCalendarView'
import AttendanceState from './AttendanceState'

type AgentOption = { email: string; name: string }
const agentLabel = (agent: AgentOption) => `${agent.name} — ${agent.email}`

export default function ManagerAgentCalendarPanel({ currentShiftDate }: { currentShiftDate: string }) {
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedEmail, setSelectedEmail] = useState('')
  const [agentSearch, setAgentSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadRoster = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/attendance?${new URLSearchParams({ shiftDate: currentShiftDate })}`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Unable to load the attendance roster')
        if (!active) return
        const nextAgents = (payload.roster || []) as AgentOption[]
        setAgents(nextAgents)
        setSelectedEmail((current) => nextAgents.some((agent) => agent.email === current) ? current : nextAgents[0]?.email || '')
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load the attendance roster')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadRoster()
    return () => { active = false }
  }, [currentShiftDate])

  useEffect(() => {
    const selected = agents.find((agent) => agent.email === selectedEmail)
    if (selected) setAgentSearch(agentLabel(selected))
  }, [agents, selectedEmail])

  if (loading) return <AttendanceState kind="loading" title="Loading agent calendars" description="Fetching the active attendance roster." />
  if (error) return <AttendanceState kind="error" title="Agent calendars unavailable" description={error} />
  if (!agents.length) return <AttendanceState kind="empty" title="No roster agents" description="Add active operational agents before viewing personal calendars." />

  const selectedAgent = agents.find((agent) => agent.email === selectedEmail) || agents[0]
  const chooseFromSearch = (value: string, allowFirstPartial = false) => {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    const exact = agents.find((agent) => agentLabel(agent).toLowerCase() === normalized || agent.email.toLowerCase() === normalized)
    const partial = allowFirstPartial
      ? agents.find((agent) => agent.name.toLowerCase().includes(normalized) || agent.email.toLowerCase().includes(normalized))
      : undefined
    const match = exact || partial
    if (!match) return false
    setSelectedEmail(match.email)
    setAgentSearch(agentLabel(match))
    return true
  }
  return <div className="space-y-6">
    <div className="rounded-xl border border-outline-variant/30 bg-surface p-5">
      <div className="mb-1 flex items-center gap-2"><CalendarDays size={20} className="text-primary" /><h2 className="font-hanken text-xl font-bold text-on-surface">Agent personal calendar</h2></div>
      <p className="mb-4 text-sm text-on-surface-variant">This uses the same resolved monthly calendar the selected agent sees. Access is limited to Team Leader and above.</p>
      <label className="block max-w-lg"><span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-on-surface-variant"><UserRoundSearch size={14} />Select agent</span><input type="search" list="attendance-agent-calendar-options" value={agentSearch} onChange={(event) => { setAgentSearch(event.target.value); chooseFromSearch(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); chooseFromSearch(agentSearch, true) } }} onBlur={() => { if (!chooseFromSearch(agentSearch)) setAgentSearch(agentLabel(selectedAgent)) }} placeholder="Search by agent name or email" autoComplete="off" className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant" /><datalist id="attendance-agent-calendar-options">{agents.map((agent) => <option key={agent.email} value={agentLabel(agent)} />)}</datalist></label>
    </div>
    <AgentCalendarView key={selectedAgent.email} currentShiftDate={currentShiftDate} agentEmail={selectedAgent.email} agentName={selectedAgent.name} />
  </div>
}
