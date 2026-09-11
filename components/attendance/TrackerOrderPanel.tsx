'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListOrdered, Search, Save } from 'lucide-react'
import type { RosterAttendanceAgent } from '@/lib/attendance'
import type { TrackerOrderPreviewRow } from '@/lib/attendanceManagement'
import AttendanceState from './AttendanceState'

type OrderedAgent = { email: string; name: string; position: number }

export default function TrackerOrderPanel() {
  const [agents, setAgents] = useState<OrderedAgent[]>([])
  const [roster, setRoster] = useState<RosterAttendanceAgent[]>([])
  const [rawText, setRawText] = useState('')
  const [previewRows, setPreviewRows] = useState<TrackerOrderPreviewRow[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [issues, setIssues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/attendance/order', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load tracker order')
      setAgents(payload.agents || [])
      setRoster(payload.roster || [])
      setIssues(payload.issues || [])
      if (payload.agents?.length) setRawText(payload.agents.map((agent: OrderedAgent) => agent.name).join('\n'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load tracker order')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const preview = async () => {
    setSaving(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/attendance/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to find roster matches')
      setPreviewRows(payload.rows || [])
      setRoster(payload.roster || roster)
      setIssues(payload.issues || [])
      setSelections(Object.fromEntries(
        (payload.rows || []).filter((row: TrackerOrderPreviewRow) => row.selectedEmail)
          .map((row: TrackerOrderPreviewRow) => [String(row.position), row.selectedEmail])
      ))
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to find roster matches') }
    finally { setSaving(false) }
  }

  const save = async () => {
    setSaving(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/attendance/order', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, selections }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setIssues(payload.issues || [])
        throw new Error(payload.error || 'Unable to save tracker order')
      }
      setPreviewRows([]); setSelections({})
      await load()
      setMessage(`Saved ${payload.saved} agents in tracker order.`)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save tracker order') }
    finally { setSaving(false) }
  }

  const unresolvedCount = useMemo(
    () => previewRows.filter((row) => !selections[String(row.position)]).length,
    [previewRows, selections]
  )

  if (loading) return <AttendanceState kind="loading" title="Loading tracker order" description="Checking the saved Google Sheet row order." />
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
    <div className="space-y-5">
      <div className="rounded-xl border border-outline-variant/30 bg-surface p-5">
        <div className="mb-4 flex items-center gap-2"><ListOrdered size={20} className="text-primary" /><h2 className="font-hanken text-xl font-bold text-on-surface">Paste tracker agent order</h2></div>
        <p className="mb-3 text-sm text-on-surface-variant">Exact names match immediately. Shortened names, reordered parts, middle-name differences, and small typos receive ranked roster suggestions for your confirmation.</p>
        <textarea value={rawText} onChange={(event) => { setRawText(event.target.value); setPreviewRows([]); setSelections({}); setIssues([]) }} rows={16} placeholder={'Carla Medina\n\nMaria Luisa De Vera\n\nJoniboy Petronilo'} className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-low p-3 font-mono text-sm text-on-surface outline-none focus:border-primary" />
        <button type="button" onClick={() => void preview()} disabled={saving || !rawText.trim()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"><Search size={16} />{saving ? 'Searching…' : 'Find roster matches'}</button>
        {error && <p className="mt-3 text-sm text-error">{error}</p>}{message && <p className="mt-3 text-sm text-success">{message}</p>}
        {issues.length > 0 && <ul className="mt-3 list-disc rounded-lg bg-warning-container/50 p-4 pl-8 text-sm text-on-warning-container">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </div>

      {previewRows.length > 0 && <div className="rounded-xl border border-outline-variant/30 bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-on-surface">Confirm roster matches</h3><p className="text-sm text-on-surface-variant">Review every suggested match. The save remains atomic and rejects duplicate or missing agents.</p></div><button type="button" onClick={() => void save()} disabled={saving || unresolvedCount > 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40"><Save size={16} />Save confirmed order</button></div>
        {unresolvedCount > 0 && <p className="mb-3 text-sm text-warning">Choose a roster agent for {unresolvedCount} unresolved row{unresolvedCount === 1 ? '' : 's'}.</p>}
        <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[650px]"><thead className="sticky top-0 bg-surface-container-low"><tr>{['#','Pasted name','Roster match','Confidence'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{previewRows.map((row) => {
          const selectedEmail = selections[String(row.position)] || ''
          const selectedCandidate = row.candidates.find((candidate) => candidate.email === selectedEmail)
          const suggestedEmails = new Set(row.candidates.map((candidate) => candidate.email))
          return <tr key={`${row.position}-${row.inputName}`} className={row.matchType === 'exact' ? '' : 'bg-warning-container/10'}><td className="px-3 py-2 text-xs text-on-surface-variant">{row.position}</td><td className="px-3 py-2 text-sm font-medium text-on-surface">{row.inputName}</td><td className="px-3 py-2">{row.matchType === 'exact' ? <span className="text-sm text-on-surface">{row.candidates[0].name}</span> : <select value={selectedEmail} onChange={(event) => setSelections((current) => ({ ...current, [String(row.position)]: event.target.value }))} className="w-full rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-sm"><option value="">Choose roster agent…</option>{row.candidates.length > 0 && <optgroup label="Suggested matches">{row.candidates.map((candidate) => <option key={candidate.email} value={candidate.email}>{candidate.name} ({candidate.score}%)</option>)}</optgroup>}<optgroup label="All roster agents">{roster.filter((agent) => !suggestedEmails.has(agent.email)).map((agent) => <option key={agent.email} value={agent.email}>{agent.name}</option>)}</optgroup></select>}</td><td className="px-3 py-2 text-xs"><span className={`rounded-full px-2 py-1 font-semibold ${row.matchType === 'exact' ? 'bg-success-container text-on-success-container' : selectedCandidate ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{row.matchType === 'exact' ? 'Exact' : selectedCandidate ? `${selectedCandidate.score}% suggested` : 'Manual review'}</span></td></tr>
        })}</tbody></table></div>
      </div>}
    </div>
    <div className="rounded-xl border border-outline-variant/30 bg-surface p-5"><h3 className="font-semibold text-on-surface">Saved output order</h3><ol className="mt-3 max-h-[720px] space-y-1 overflow-auto text-sm">{agents.map((agent) => <li key={agent.email} className="grid grid-cols-[2rem_1fr] rounded-md bg-surface-container-low px-3 py-2"><span className="text-on-surface-variant">{agent.position}</span><span className="text-on-surface">{agent.name}</span></li>)}</ol></div>
  </div>
}
