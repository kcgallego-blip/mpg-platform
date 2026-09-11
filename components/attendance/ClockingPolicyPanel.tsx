'use client'

import { Save, Search, Wifi } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AttendanceState from './AttendanceState'

type Agent = { email: string; name: string; teamLeader: string; selfServiceEnabled: boolean; isWfh: boolean }

export default function ClockingPolicyPanel() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [wfh, setWfh] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const response = await fetch('/api/attendance/clock-policy', { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to load clocking policy'); setAgents(payload.agents || []); setWfh(new Set((payload.agents || []).filter((agent: Agent) => agent.isWfh).map((agent: Agent) => agent.email))) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load clocking policy') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return query ? agents.filter((agent) => agent.name.toLowerCase().includes(query) || agent.email.includes(query) || agent.teamLeader.toLowerCase().includes(query)) : agents }, [agents, search])
  const toggle = (email: string) => setWfh((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next })
  const save = async () => { setSaving(true); setError(''); setMessage(''); try { const response = await fetch('/api/attendance/clock-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wfhEmails: [...wfh] }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to save WFH policy'); setMessage(`Saved ${payload.saved} WFH roster assignment${payload.saved === 1 ? '' : 's'}.`); await load() } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save WFH policy') } finally { setSaving(false) } }
  if (loading) return <AttendanceState kind="loading" title="Loading clocking policy" description="Fetching pilot and WFH roster settings." />
  if (error && !agents.length) return <AttendanceState kind="error" title="Clocking policy unavailable" description={error} onRetry={() => void load()} />
  return <section className="space-y-4"><div className="rounded-xl border border-outline-variant/30 bg-surface p-5"><div className="flex items-center gap-2"><Wifi size={19} className="text-primary" /><h2 className="font-hanken text-xl font-bold">Work location policy</h2></div><p className="mt-1 text-sm text-on-surface-variant">WFH Agents bypass office-network warnings. Their IP and browser remain in the immutable clock audit.</p><label className="mt-4 flex max-w-lg items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agent, email, or Team Leader" className="w-full bg-transparent text-sm outline-none" /></label><div className="mt-3 flex gap-3 text-xs"><button onClick={() => setWfh(new Set([...wfh, ...filtered.map((agent) => agent.email)]))} className="font-semibold text-primary">Mark filtered WFH</button><button onClick={() => setWfh((current) => { const next = new Set(current); filtered.forEach((agent) => next.delete(agent.email)); return next })} className="font-semibold text-on-surface-variant">Mark filtered Office</button><span>{wfh.size} WFH</span></div></div><div className="max-h-[520px] overflow-auto rounded-xl border border-outline-variant/30 bg-surface"><table className="w-full min-w-[720px]"><thead className="sticky top-0 bg-surface-container-low"><tr>{['WFH','Agent','Team Leader','Pilot'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-bold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{filtered.map((agent) => <tr key={agent.email}><td className="px-3 py-2"><input type="checkbox" checked={wfh.has(agent.email)} onChange={() => toggle(agent.email)} /></td><td className="px-3 py-2"><div className="text-sm font-semibold">{agent.name}</div><div className="text-xs text-on-surface-variant">{agent.email}</div></td><td className="px-3 py-2 text-xs">{agent.teamLeader || '—'}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${agent.selfServiceEnabled ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{agent.selfServiceEnabled ? 'Enabled' : 'Not enabled'}</span></td></tr>)}</tbody></table></div><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50"><Save size={16} />{saving ? 'Saving…' : 'Save WFH assignments'}</button>{error && <p className="text-sm text-error">{error}</p>}{message && <p className="text-sm text-success">{message}</p>}</section>
}
