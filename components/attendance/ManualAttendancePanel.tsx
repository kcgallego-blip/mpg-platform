'use client'

import { ClipboardPaste, RefreshCw, Save } from 'lucide-react'
import { ClipboardEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AttendanceOutcomeValue, AttendanceRecord, ResolvedAttendanceDay, formatAttendanceTime } from '@/lib/attendance'
import AttendanceState from './AttendanceState'

type EditRow = ResolvedAttendanceDay & { timeInEdit: string; timeOutEdit: string; outcomeEdit: AttendanceOutcomeValue | ''; expectedUpdatedAt: string | null }
const protectedException = (row: ResolvedAttendanceDay) => Boolean(row.exceptionKind && row.exceptionKind !== 'scheduled' && row.exceptionKind !== 'day_off')
const clockValue = (value: string | null) => formatAttendanceTime(value) === '--' ? '' : formatAttendanceTime(value)

export default function ManualAttendancePanel({ currentShiftDate }: { currentShiftDate: string }) {
  const [shiftDate, setShiftDate] = useState(currentShiftDate)
  const [rows, setRows] = useState<EditRow[]>([])
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch(`/api/attendance?${new URLSearchParams({ shiftDate })}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load manual entry')
      const records = new Map<string, AttendanceRecord>((payload.records || []).map((record: AttendanceRecord) => [record.agent.toLowerCase(), record]))
      const next = (payload.days || []).map((day: ResolvedAttendanceDay) => {
        const record = records.get(day.agent)
        return { ...day, timeInEdit: clockValue(day.timeIn), timeOutEdit: clockValue(day.timeOut), outcomeEdit: day.attendanceOutcome || '', expectedUpdatedAt: record?.updated_at || null }
      })
      setRows(next)
      setOriginal(Object.fromEntries(next.map((row: EditRow) => [row.agent, `${row.timeInEdit}|${row.timeOutEdit}|${row.outcomeEdit}`])))
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load manual entry') }
    finally { setLoading(false) }
  }, [shiftDate])
  useEffect(() => { void load() }, [load])

  const update = (index: number, field: 'timeInEdit' | 'timeOutEdit' | 'outcomeEdit', value: string) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  const changedRows = useMemo(() => rows.filter((row) => !protectedException(row) && original[row.agent] !== `${row.timeInEdit}|${row.timeOutEdit}|${row.outcomeEdit}`), [rows, original])

  const pasteGrid = (event: ClipboardEvent<HTMLInputElement>, startIndex: number, startField: 0 | 1) => {
    const matrix = event.clipboardData.getData('text').trimEnd().split(/\r?\n/).map((line) => line.split('\t'))
    if (matrix.length === 1 && matrix[0].length === 1) return
    event.preventDefault()
    setRows((current) => {
      const copy = current.map((row) => ({ ...row }))
      matrix.forEach((cells, rowOffset) => {
        const target = copy[startIndex + rowOffset]
        if (!target || protectedException(target)) return
        cells.forEach((value, columnOffset) => {
          const field = startField + columnOffset
          if (field === 0) target.timeInEdit = value.trim()
          if (field === 1) target.timeOutEdit = value.trim()
        })
      })
      return copy
    })
  }

  const save = async () => {
    if (!changedRows.length) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/attendance/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shiftDate, rows: changedRows.map((row) => ({ agentEmail: row.agent, timeIn: row.timeInEdit, timeOut: row.timeOutEdit, outcome: row.outcomeEdit || null, expectedUpdatedAt: row.expectedUpdatedAt })) }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save manual attendance')
      await load()
      setMessage(`Saved ${payload.saved} changed agent${payload.saved === 1 ? '' : 's'}.`)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save manual attendance') }
    finally { setSaving(false) }
  }

  return <section>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-hanken text-xl font-bold text-on-surface">Manual attendance entry</h2><p className="mt-1 text-sm text-on-surface-variant">Use this for September 1–6 backfill or later corrections. Paste two spreadsheet columns starting in any Time In cell.</p></div><div className="flex items-end gap-2"><label><span className="mb-1 block text-xs font-semibold uppercase text-on-surface-variant">Eastern shift date</span><input type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="rounded-lg border border-outline-variant/50 bg-surface px-3 py-2 text-sm" /></label><button type="button" onClick={() => void load()} className="rounded-lg border border-outline-variant/50 p-2.5"><RefreshCw size={17} /></button><button type="button" onClick={() => void save()} disabled={saving || !changedRows.length} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary disabled:opacity-40"><Save size={16} />Save {changedRows.length || ''} changes</button></div></div>
    <div className="mb-3 flex items-center gap-2 text-xs text-on-surface-variant"><ClipboardPaste size={15} />Multi-cell paste supports Time In and Time Out columns. Use Attendance outcome to confirm Absent or explicitly keep a missing record as Not absent.</div>
    {error ? <AttendanceState kind="error" title="Manual entry unavailable" description={error} onRetry={() => void load()} /> : loading ? <AttendanceState kind="loading" title="Loading attendance grid" description={`Resolving schedules for ${shiftDate}.`} /> : <div className="overflow-auto rounded-xl border border-outline-variant/30 bg-surface"><table className="w-full min-w-[1040px]"><thead className="bg-surface-container-low"><tr>{['#','Agent','Calendar date','Schedule status','Time In','Time Out','Attendance outcome'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase text-on-surface-variant">{heading}</th>)}</tr></thead><tbody className="divide-y divide-outline-variant/20">{rows.map((row, index) => { const enabled = !protectedException(row); const outcomeEnabled = enabled && row.status !== 'Day Off' && !row.status.startsWith('RDOT'); return <tr key={row.agent}><td className="px-3 py-2 text-xs text-on-surface-variant">{index + 1}</td><td className="px-3 py-2"><div className="text-sm font-semibold">{row.agentName}</div><div className="text-xs text-on-surface-variant">{row.agent}</div></td><td className="px-3 py-2 text-xs font-semibold text-on-surface">{row.shiftDate}{row.shiftGroup === 'overnight' && <span className="ml-1 text-primary">(+1 Overnight)</span>}</td><td className="px-3 py-2 text-xs"><span className="rounded-full bg-surface-container-high px-2 py-1">{row.status}</span></td><td className="px-3 py-2"><input value={row.timeInEdit} disabled={!enabled} onChange={(event) => update(index, 'timeInEdit', event.target.value)} onPaste={(event) => pasteGrid(event, index, 0)} placeholder="HH:mm:ss" className="w-32 rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono text-xs disabled:opacity-40" /></td><td className="px-3 py-2"><input value={row.timeOutEdit} disabled={!enabled} onChange={(event) => update(index, 'timeOutEdit', event.target.value)} onPaste={(event) => pasteGrid(event, index, 1)} placeholder="HH:mm:ss" className="w-32 rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 font-mono text-xs disabled:opacity-40" /></td><td className="px-3 py-2"><select value={row.outcomeEdit} disabled={!outcomeEnabled} onChange={(event) => update(index, 'outcomeEdit', event.target.value)} className="w-48 rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 text-xs disabled:opacity-40"><option value="">No decision</option><option value="confirmed_absent">Confirm Absent</option><option value="not_absent">Not absent — keep pending</option></select></td></tr> })}</tbody></table></div>}
    {message && <p className="mt-3 text-sm text-success">{message}</p>}
  </section>
}
