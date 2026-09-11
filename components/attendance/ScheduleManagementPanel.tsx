'use client'

import { ClipboardPaste, FileUp, RotateCcw, Save, Users, X } from 'lucide-react'
import { ClipboardEvent, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { RosterAttendanceAgent, ScheduleExceptionKind, ScheduleSnapshotEntry, ShiftGroup } from '@/lib/attendance'
import type { ScheduleRevertChange } from '@/lib/attendanceManagement'
import {
  parseAttendanceScheduleMatrix,
  previewAttendanceScheduleImport,
  type ScheduleImportRow,
  type ScheduleImportScope,
} from '@/lib/attendanceScheduleImport'
import AttendanceState from './AttendanceState'

type EditorPayload = {
  entries: ScheduleSnapshotEntry[]
  rosterDefaults: RosterAttendanceAgent[]
  basedOn: { id: string; effectiveFrom: string; createdAt: string } | null
  history: Array<{ id: string; effectiveFrom: string; createdAt: string }>
}
type RevertPayload = {
  source: { id: string; effectiveFrom: string; createdAt: string }
  previous: { id: string; effectiveFrom: string; createdAt: string }
  changes: ScheduleRevertChange[]
  error?: string
}

const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const groupLabel = (group: ShiftGroup) => group === 'overnight' ? 'Overnight' : 'Normal / Graveyard'

export default function ScheduleManagementPanel({ currentShiftDate }: { currentShiftDate: string }) {
  const [mode, setMode] = useState<'snapshot' | 'exceptions'>('snapshot')
  const [effectiveFrom, setEffectiveFrom] = useState(currentShiftDate)
  const [entries, setEntries] = useState<ScheduleSnapshotEntry[]>([])
  const [defaults, setDefaults] = useState<RosterAttendanceAgent[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [basedOn, setBasedOn] = useState<EditorPayload['basedOn']>(null)
  const [history, setHistory] = useState<EditorPayload['history']>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preparingRevertId, setPreparingRevertId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [bulk, setBulk] = useState({ startShift: '', endShift: '', off1: '', off2: '' })
  const [importScope, setImportScope] = useState<ScheduleImportScope>('all')
  const [scheduleFile, setScheduleFile] = useState<{ fileName: string; rows: ScheduleImportRow[] } | null>(null)
  const [fuzzyMatchesApproved, setFuzzyMatchesApproved] = useState(false)
  const [readingFile, setReadingFile] = useState(false)

  const [exceptionKind, setExceptionKind] = useState<ScheduleExceptionKind>('holiday_off')
  const [baseDate, setBaseDate] = useState(currentShiftDate)
  const [exceptionDates, setExceptionDates] = useState<Record<string, string>>({})
  const [exceptionNote, setExceptionNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch(`/api/attendance/schedules?${new URLSearchParams({ effectiveFrom })}`, { cache: 'no-store' })
      const payload = await response.json() as EditorPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to load schedule')
      setEntries(payload.entries || []); setDefaults(payload.rosterDefaults || []); setBasedOn(payload.basedOn); setHistory(payload.history || []); setSelected(new Set())
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load schedule') }
    finally { setLoading(false) }
  }, [effectiveFrom])
  useEffect(() => { void load() }, [load])

  const importPreview = useMemo(
    () => scheduleFile ? previewAttendanceScheduleImport(scheduleFile.rows, entries, importScope) : null,
    [entries, importScope, scheduleFile]
  )

  const updateEntry = (index: number, field: keyof ScheduleSnapshotEntry, value: string) => setEntries((current) => current.map((entry, row) => row === index ? { ...entry, [field]: value } : entry))
  const toggle = (email: string) => setSelected((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next })
  const selectGroup = (group?: ShiftGroup) => {
    const picked = entries.filter((entry) => !group || entry.shiftGroup === group).map((entry) => entry.email)
    setSelected(new Set(picked))
    setExceptionDates((current) => Object.fromEntries(entries.map((entry) => [entry.email, current[entry.email] || (entry.shiftGroup === 'overnight' ? addDays(baseDate, 1) : baseDate)])))
  }

  const pasteSchedule = (event: ClipboardEvent<HTMLInputElement>, startIndex: number, startColumn: number) => {
    const matrix = event.clipboardData.getData('text').trimEnd().split(/\r?\n/).map((line) => line.split('\t'))
    if (matrix.length === 1 && matrix[0].length === 1) return
    event.preventDefault()
    const fields: Array<keyof ScheduleSnapshotEntry> = ['startShift', 'endShift', 'off1', 'off2', 'shiftGroup']
    setEntries((current) => {
      const copy = current.map((entry) => ({ ...entry }))
      matrix.forEach((cells, rowOffset) => cells.forEach((value, colOffset) => {
        const target = copy[startIndex + rowOffset]
        const field = fields[startColumn + colOffset]
        if (!target || !field) return
        if (field === 'shiftGroup') target.shiftGroup = /overnight/i.test(value) ? 'overnight' : 'normal_graveyard'
        else target[field] = value.trim() as never
      }))
      return copy
    })
  }

  const applyBulk = () => setEntries((current) => current.map((entry) => {
    if (!selected.has(entry.email)) return entry
    return { ...entry, startShift: bulk.startShift || entry.startShift, endShift: bulk.endShift || entry.endShift, off1: bulk.off1 || entry.off1, off2: bulk.off2 || entry.off2 }
  }))

  const resetSelected = () => {
    const defaultByEmail = new Map(defaults.map((entry) => [entry.email, entry]))
    setEntries((current) => current.map((entry) => selected.has(entry.email) ? defaultByEmail.get(entry.email) || entry : entry))
  }

  const readScheduleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setReadingFile(true); setError(null); setMessage(null)
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null
      if (!worksheet) throw new Error('The schedule file does not contain a readable sheet.')
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: '' })
      const rows = parseAttendanceScheduleMatrix(matrix)
      setScheduleFile({ fileName: file.name, rows })
      setFuzzyMatchesApproved(false)
    } catch (fileError) {
      setScheduleFile(null)
      setError(fileError instanceof Error ? fileError.message : 'Unable to read schedule file')
    } finally {
      setReadingFile(false)
      event.target.value = ''
    }
  }

  const applyScheduleFile = () => {
    if (!scheduleFile || !importPreview?.matches.length) {
      setError('The file has no roster matches in the selected shift group.')
      return
    }
    const fuzzyCount = importPreview.matches.filter((match) => match.matchType === 'fuzzy').length
    if (fuzzyCount && !fuzzyMatchesApproved) {
      setError('Review and approve the fuzzy name matches before applying this file.')
      return
    }
    const matchByEmail = new Map(importPreview.matches.map((match) => [match.email, match]))
    setEntries((current) => current.map((entry) => {
      const match = matchByEmail.get(entry.email)
      return match ? {
        ...entry,
        startShift: match.startShift,
        endShift: match.endShift,
        off1: match.off1 ?? entry.off1,
        off2: match.off2 ?? entry.off2,
      } : entry
    }))
    setSelected(new Set(importPreview.matches.map((match) => match.email)))
    setNote((current) => current || `Imported schedule from ${scheduleFile.fileName}`)
    setMessage(`Prefilled schedules for ${importPreview.matches.length} matched agent${importPreview.matches.length === 1 ? '' : 's'} from ${scheduleFile.fileName}. Review the selected rows, then save the complete snapshot.`)
    setScheduleFile(null)
    setFuzzyMatchesApproved(false)
  }

  const prepareRevert = async (version: EditorPayload['history'][number]) => {
    if (effectiveFrom <= version.effectiveFrom) {
      setError(`Choose a return effective date after ${version.effectiveFrom}, then prepare the revert.`)
      return
    }
    setPreparingRevertId(version.id); setError(null); setMessage(null)
    try {
      const response = await fetch(`/api/attendance/schedules?${new URLSearchParams({ effectiveFrom, revertVersionId: version.id })}`, { cache: 'no-store' })
      const payload = await response.json() as RevertPayload
      if (!response.ok) throw new Error(payload.error || 'Unable to prepare schedule revert')
      if (!payload.changes.length) throw new Error('This version did not change any active agent schedule values compared with its previous version.')
      const restoreByEmail = new Map(payload.changes.map((change) => [change.email, change.restore]))
      setEntries((current) => current.map((entry) => {
        const restore = restoreByEmail.get(entry.email)
        return restore ? { ...entry, ...restore } : entry
      }))
      setSelected(new Set(payload.changes.map((change) => change.email)))
      setNote(`Revert temporary schedule from ${payload.source.effectiveFrom} to snapshot ${payload.previous.effectiveFrom}`)
      setMessage(`Prepared ${payload.changes.length} changed agent${payload.changes.length === 1 ? '' : 's'} for reversion effective ${effectiveFrom}. Review the selected rows, then save the complete snapshot.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to prepare schedule revert')
    } finally {
      setPreparingRevertId(null)
    }
  }

  const saveSnapshot = async () => {
    const historical = effectiveFrom < currentShiftDate
    if (historical && !window.confirm('This effective date is in the past. Create an audited correction snapshot?')) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/attendance/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ effectiveFrom, entries, note, confirmHistorical: historical }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save schedule')
      setNote(''); await load(); setMessage(`Created a complete ${payload.saved}-agent schedule snapshot effective ${effectiveFrom}.`)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save schedule') }
    finally { setSaving(false) }
  }

  const saveExceptions = async () => {
    if (!selected.size) { setError('Select at least one agent.'); return }
    setSaving(true); setError(null); setMessage(null)
    try {
      const selectedEntries = entries.filter((entry) => selected.has(entry.email))
      const response = await fetch('/api/attendance/exceptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: selectedEntries.map((entry) => ({ agentEmail: entry.email, shiftDate: exceptionDates[entry.email] || (entry.shiftGroup === 'overnight' ? addDays(baseDate, 1) : baseDate), kind: exceptionKind, startShift: exceptionKind === 'scheduled' ? entry.startShift : null, endShift: exceptionKind === 'scheduled' ? entry.endShift : null, note: exceptionNote })) }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save exceptions')
      setMessage(`Saved ${payload.saved} individual agent/date exception${payload.saved === 1 ? '' : 's'}.`)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save exceptions') }
    finally { setSaving(false) }
  }

  if (loading) return <AttendanceState kind="loading" title="Loading effective schedule" description={`Resolving the roster snapshot effective ${effectiveFrom}.`} />
  if (error && !entries.length) return <AttendanceState kind="error" title="Schedule editor unavailable" description={error} onRetry={() => void load()} />

  return <section className="space-y-5">
    <div className="flex gap-2"><button type="button" onClick={() => setMode('snapshot')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'snapshot' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>Effective schedule</button><button type="button" onClick={() => setMode('exceptions')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === 'exceptions' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>Date exceptions</button></div>

    {mode === 'snapshot' ? <>
      <div className="rounded-xl border border-outline-variant/30 bg-surface p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-hanken text-xl font-bold text-on-surface">Effective-from roster snapshot</h2><p className="mt-1 text-sm text-on-surface-variant">No end date. A later complete snapshot supersedes this one without changing earlier calendar dates.</p></div><label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Effective shift date</span><input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-sm" /></label></div>{basedOn && <p className="mt-3 text-xs text-on-surface-variant">Prefilled from snapshot effective {basedOn.effectiveFrom}. Saving on the same date creates a newer audited version; history is retained.</p>}</div>
      <div className="rounded-xl border border-outline-variant/30 bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-sm font-bold text-on-surface">Import schedule file</h3><p className="mt-1 text-xs text-on-surface-variant">CSV, XLS, or XLSX. Agent Name, shift start/end, Off 1, and Off 2 are read; unrelated columns are ignored.</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Apply to</span><select value={importScope} onChange={(event) => { setImportScope(event.target.value as ScheduleImportScope); setFuzzyMatchesApproved(false) }} className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"><option value="all">All agents</option><option value="normal_graveyard">Normal / Graveyard</option><option value="overnight">Overnight</option></select></label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"><FileUp size={16} />{readingFile ? 'Reading…' : 'Choose file'}<input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void readScheduleFile(event)} disabled={readingFile} className="sr-only" /></label>
          </div>
        </div>
        {scheduleFile && importPreview && <div className="mt-4 rounded-lg border border-outline-variant/40 bg-surface-container-low/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{scheduleFile.fileName}</p><p className="text-xs text-on-surface-variant">{importPreview.matches.length} matched · {importPreview.matches.filter((match) => match.matchType === 'fuzzy').length} fuzzy · {importPreview.unmatched.length} unresolved · {importPreview.outsideScope.length} outside selected group</p></div><button type="button" onClick={() => { setScheduleFile(null); setFuzzyMatchesApproved(false) }} className="rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Remove selected schedule file"><X size={16} /></button></div>
          {importPreview.unmatched.length > 0 && <p className="mt-2 text-xs text-error">Not matched: {importPreview.unmatched.map((row) => row.name).join(', ')}</p>}
          {importPreview.outsideScope.length > 0 && <p className="mt-2 text-xs text-on-surface-variant">Skipped because of selected group: {importPreview.outsideScope.map((row) => row.name).join(', ')}</p>}
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-primary">Review {importPreview.matches.length} roster matches</summary><div className="mt-2 max-h-60 overflow-auto rounded border border-outline-variant/30"><table className="w-full min-w-[760px] text-xs"><thead className="sticky top-0 bg-surface-container-high"><tr>{['File name', 'Roster agent', 'Match', 'Shift start', 'Shift end', 'Off 1', 'Off 2'].map((heading) => <th key={heading} className="px-2 py-2 text-left font-semibold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{importPreview.matches.map((match) => <tr key={`${match.rowNumber}-${match.email}`}><td className="px-2 py-2">{match.name}</td><td className="px-2 py-2 font-semibold">{match.rosterName}</td><td className="px-2 py-2">{match.matchType === 'exact' ? 'Exact' : `Fuzzy ${match.score}%`}</td><td className="px-2 py-2">{match.startShift}</td><td className="px-2 py-2">{match.endShift}</td><td className="px-2 py-2">{match.off1 ?? 'Keep existing'}</td><td className="px-2 py-2">{match.off2 ?? 'Keep existing'}</td></tr>)}</tbody></table></div></details>
          {importPreview.matches.some((match) => match.matchType === 'fuzzy') && <label className="mt-3 flex items-start gap-2 text-xs text-on-surface"><input type="checkbox" checked={fuzzyMatchesApproved} onChange={(event) => setFuzzyMatchesApproved(event.target.checked)} className="mt-0.5" /><span>I reviewed and approve the fuzzy roster-name matches shown above.</span></label>}
          <button type="button" onClick={applyScheduleFile} disabled={!importPreview.matches.length || (importPreview.matches.some((match) => match.matchType === 'fuzzy') && !fuzzyMatchesApproved)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:cursor-not-allowed disabled:opacity-40"><FileUp size={14} />Prefill matched schedules</button>
        </div>}
      </div>
      <div className="rounded-xl border border-outline-variant/30 bg-surface p-4"><div className="mb-3 flex flex-wrap gap-2"><button onClick={() => selectGroup()} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">Select all</button><button onClick={() => selectGroup('normal_graveyard')} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">Select Normal / Graveyard</button><button onClick={() => selectGroup('overnight')} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">Select Overnight</button><span className="self-center text-xs text-on-surface-variant">{selected.size} selected</span></div><div className="grid gap-2 md:grid-cols-5">{(['startShift','endShift','off1','off2'] as const).map((field) => <input key={field} value={bulk[field]} onChange={(event) => setBulk((current) => ({ ...current, [field]: event.target.value }))} placeholder={{ startShift: 'Bulk start', endShift: 'Bulk end', off1: 'Bulk Off 1', off2: 'Bulk Off 2' }[field]} className="rounded border border-outline-variant bg-surface-container-low px-2 py-2 text-xs" />)}<button type="button" onClick={applyBulk} disabled={!selected.size} className="rounded bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:opacity-40">Apply to selected</button></div><button type="button" onClick={resetSelected} disabled={!selected.size} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary disabled:opacity-40"><RotateCcw size={14} />Reset selected to roster defaults</button></div>
      <ScheduleGrid entries={entries} selected={selected} toggle={toggle} update={updateEntry} paste={pasteSchedule} />
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-[280px] flex-1"><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Snapshot note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Temporary client schedule, reversion, or correction reason" className="w-full rounded-lg border border-outline-variant/50 bg-surface px-3 py-2 text-sm" /></label><button type="button" onClick={() => void saveSnapshot()} disabled={saving || !entries.length} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-40"><Save size={16} />Save complete snapshot</button></div>
      {history.length > 0 && <details className="rounded-xl border border-outline-variant/30 bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold">Recent immutable versions</summary><p className="mt-2 text-xs text-on-surface-variant">Set the return effective date above, then prepare a revert from the temporary version. Only agents changed by that version will be restored and selected for review.</p><ul className="mt-3 space-y-2 text-xs text-on-surface-variant">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant/30 px-3 py-2"><span>{item.effectiveFrom} · saved {new Date(item.createdAt).toLocaleString()}</span><button type="button" onClick={() => void prepareRevert(item)} disabled={saving || preparingRevertId !== null || effectiveFrom <= item.effectiveFrom} className="inline-flex items-center gap-1 rounded border border-primary/40 px-2 py-1 font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={13} />{preparingRevertId === item.id ? 'Preparing…' : 'Prepare revert'}</button></li>)}</ul></details>}
    </> : <>
      <div className="rounded-xl border border-outline-variant/30 bg-surface p-5"><h2 className="font-hanken text-xl font-bold text-on-surface">Agent/date schedule exceptions</h2><p className="mt-1 text-sm text-on-surface-variant">Holiday bulk selections are convenient, but every result is stored separately per agent and reviewed shift date. Transition Off can be assigned to just one agent.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Holiday/base date</span><input type="date" value={baseDate} onChange={(event) => { const next = event.target.value; setBaseDate(next); setExceptionDates(Object.fromEntries(entries.map((entry) => [entry.email, entry.shiftGroup === 'overnight' ? addDays(next, 1) : next]))) }} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm" /></label><label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Exception</span><select value={exceptionKind} onChange={(event) => setExceptionKind(event.target.value as ScheduleExceptionKind)} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"><option value="holiday_off">Holiday Off</option><option value="vacation_leave">Vacation Leave</option><option value="sick_leave">Sick Leave</option><option value="transition_off">Transition Off</option><option value="day_off">Day Off</option><option value="scheduled">One-day scheduled shift</option></select></label><label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Note</span><input value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm" /></label></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Users size={16} className="text-primary" /><button onClick={() => selectGroup('normal_graveyard')} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">Normal / Graveyard</button><button onClick={() => selectGroup('overnight')} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">Overnight (+1 default)</button><button onClick={() => selectGroup()} className="rounded border border-outline-variant px-3 py-1.5 text-xs font-semibold">All agents</button><span className="text-xs text-on-surface-variant">Review each selected date below.</span></div>
      </div>
      <div className="overflow-auto rounded-xl border border-outline-variant/30 bg-surface"><table className="w-full min-w-[720px]"><thead className="bg-surface-container-low"><tr>{['Select','Agent','Shift group','Exception shift date','Current shift'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{entries.map((entry) => <tr key={entry.email}><td className="px-3 py-2"><input type="checkbox" checked={selected.has(entry.email)} onChange={() => toggle(entry.email)} /></td><td className="px-3 py-2"><div className="text-sm font-semibold">{entry.name}</div><div className="text-xs text-on-surface-variant">{entry.email}</div></td><td className="px-3 py-2 text-xs">{groupLabel(entry.shiftGroup)}</td><td className="px-3 py-2"><input type="date" disabled={!selected.has(entry.email)} value={exceptionDates[entry.email] || (entry.shiftGroup === 'overnight' ? addDays(baseDate, 1) : baseDate)} onChange={(event) => setExceptionDates((current) => ({ ...current, [entry.email]: event.target.value }))} className="rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-xs disabled:opacity-40" /></td><td className="px-3 py-2 text-xs">{entry.startShift || '—'} – {entry.endShift || '—'}</td></tr>)}</tbody></table></div>
      {exceptionKind === 'transition_off' && selected.size > 1 && <p className="text-sm text-warning">Transition Off is normally decided per agent. Multiple agents are allowed only after reviewing every date.</p>}
      <button type="button" onClick={() => void saveExceptions()} disabled={saving || !selected.size} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-40"><Save size={16} />Save {selected.size} individual exceptions</button>
    </>}
    {error && <p className="text-sm text-error">{error}</p>}{message && <p className="text-sm text-success">{message}</p>}
  </section>
}

function ScheduleGrid({ entries, selected, toggle, update, paste }: { entries: ScheduleSnapshotEntry[]; selected: Set<string>; toggle: (email: string) => void; update: (index: number, field: keyof ScheduleSnapshotEntry, value: string) => void; paste: (event: ClipboardEvent<HTMLInputElement>, index: number, column: number) => void }) {
  const fields: Array<{ key: keyof ScheduleSnapshotEntry; label: string }> = [{ key: 'startShift', label: 'Shift start' }, { key: 'endShift', label: 'Shift end' }, { key: 'off1', label: 'Off 1' }, { key: 'off2', label: 'Off 2' }]
  return <div className="overflow-auto rounded-xl border border-outline-variant/30 bg-surface"><div className="flex items-center gap-2 border-b border-outline-variant/30 px-4 py-2 text-xs text-on-surface-variant"><ClipboardPaste size={14} />Paste a 5-column schedule block starting in Shift start.</div><table className="w-full min-w-[980px]"><thead className="bg-surface-container-low"><tr><th className="px-3 py-2 text-left text-xs uppercase">Select</th><th className="px-3 py-2 text-left text-xs uppercase">Agent</th>{fields.map((field) => <th key={field.key} className="px-3 py-2 text-left text-xs uppercase">{field.label}</th>)}<th className="px-3 py-2 text-left text-xs uppercase">Shift group</th></tr></thead><tbody className="divide-y divide-outline-variant/20">{entries.map((entry, index) => <tr key={entry.email}><td className="px-3 py-2"><input type="checkbox" checked={selected.has(entry.email)} onChange={() => toggle(entry.email)} /></td><td className="px-3 py-2"><div className="text-sm font-semibold">{entry.name}</div><div className="text-xs text-on-surface-variant">{entry.teamLeader}</div></td>{fields.map((field, column) => <td key={field.key} className="px-2 py-1.5"><input value={String(entry[field.key] || '')} onChange={(event) => update(index, field.key, event.target.value)} onPaste={(event) => paste(event, index, column)} className="w-28 rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-xs" /></td>)}<td className="px-2 py-1.5"><select value={entry.shiftGroup} onChange={(event) => update(index, 'shiftGroup', event.target.value)} className="rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-xs"><option value="normal_graveyard">Normal / Graveyard</option><option value="overnight">Overnight</option></select></td></tr>)}</tbody></table></div>
}
