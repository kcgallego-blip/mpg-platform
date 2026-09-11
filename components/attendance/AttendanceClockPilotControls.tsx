'use client'

import { Plus, RefreshCw, Save, Search, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Agent = { email: string; name: string; selfServiceEnabled: boolean; isWfh: boolean }
type Network = { label: string; network: string }

export default function AttendanceClockPilotControls() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [networks, setNetworks] = useState<Network[]>([])
  const [lastUpdate, setLastUpdate] = useState<{ changed_by: string; changed_at: string } | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/settings/attendance-clock', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load clock settings')
      setAgents(payload.agents || [])
      setEnabled(new Set((payload.agents || []).filter((agent: Agent) => agent.selfServiceEnabled).map((agent: Agent) => agent.email)))
      setNetworks((payload.networks || []).map((network: Network) => ({ label: network.label, network: network.network })))
      setLastUpdate(payload.lastPilotUpdate || null)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load clock settings') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? agents.filter((agent) => agent.name.toLowerCase().includes(query) || agent.email.includes(query)) : agents
  }, [agents, search])
  const toggle = (email: string) => setEnabled((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next })

  const save = async () => {
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/settings/attendance-clock', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabledEmails: [...enabled], networks }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save clock settings')
      setMessage(`Enabled self-service clocking for ${payload.enabled} Agent${payload.enabled === 1 ? '' : 's'} and saved ${payload.savedNetworks} office network${payload.savedNetworks === 1 ? '' : 's'}.`)
      await load()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save clock settings') }
    finally { setSaving(false) }
  }

  return <section className="overflow-hidden rounded-2xl border border-outline/20 bg-surface/80 shadow-sm">
    <div className="border-b border-outline/15 bg-surface-container-low/60 px-6 py-5"><div className="flex items-center gap-2"><Users size={19} className="text-primary" /><h2 className="font-hanken text-xl font-bold text-on-surface">Agent Attendance Pilot</h2></div><p className="mt-1 text-sm text-on-surface-variant">Selected roster Agents can open Attendance and self-clock in production even while the public Attendance toggle is off.</p></div>
    <div className="space-y-6 p-6">
      {loading ? <p className="flex items-center gap-2 text-sm text-on-surface-variant"><RefreshCw size={15} className="animate-spin" />Loading pilot settings…</p> : <>
        <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-on-surface">Enabled Agents <span className="ml-1 rounded-full bg-primary-container/15 px-2 py-0.5 text-primary">{enabled.size}</span></p><div className="flex gap-2"><button type="button" onClick={() => setEnabled(new Set(agents.map((agent) => agent.email)))} className="text-xs font-semibold text-primary">Select all</button><button type="button" onClick={() => setEnabled(new Set())} className="text-xs font-semibold text-on-surface-variant">Clear</button></div></div><label className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"><Search size={15} className="text-on-surface-variant" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roster name or email" className="w-full bg-transparent text-sm outline-none" /></label><div className="mt-2 max-h-64 overflow-auto rounded-lg border border-outline-variant/40">{filtered.map((agent) => <label key={agent.email} className="flex cursor-pointer items-center gap-3 border-b border-outline-variant/20 px-3 py-2 last:border-0 hover:bg-surface-container-low"><input type="checkbox" checked={enabled.has(agent.email)} onChange={() => toggle(agent.email)} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{agent.name}</span><span className="block truncate text-xs text-on-surface-variant">{agent.email}{agent.isWfh ? ' · WFH' : ''}</span></span></label>)}</div>{lastUpdate && <p className="mt-2 text-xs text-on-surface-variant">Last pilot change by {lastUpdate.changed_by} on {new Date(lastUpdate.changed_at).toLocaleString()}.</p>}</div>
        <div><div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-bold text-on-surface">Approved office networks</p><p className="text-xs text-on-surface-variant">IPv4/IPv6 addresses or CIDR ranges. With none configured, detection reports “not configured.”</p></div><button type="button" onClick={() => setNetworks((current) => [...current, { label: '', network: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><Plus size={14} />Add network</button></div><div className="space-y-2">{networks.map((network, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={network.label} onChange={(event) => setNetworks((current) => current.map((item, row) => row === index ? { ...item, label: event.target.value } : item))} placeholder="Office label" className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm" /><input value={network.network} onChange={(event) => setNetworks((current) => current.map((item, row) => row === index ? { ...item, network: event.target.value } : item))} placeholder="203.0.113.0/24" className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-mono text-sm" /><button type="button" onClick={() => setNetworks((current) => current.filter((_, row) => row !== index))} aria-label="Remove office network" className="rounded-lg p-2 text-error hover:bg-error-container"><Trash2 size={17} /></button></div>)}</div></div>
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50"><Save size={16} />{saving ? 'Saving…' : 'Save pilot and networks'}</button>
      </>}
      {error && <p className="text-sm text-error">{error}</p>}{message && <p className="text-sm text-success">{message}</p>}
    </div>
  </section>
}
