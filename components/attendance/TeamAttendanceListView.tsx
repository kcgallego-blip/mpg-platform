'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Clipboard, Copy, RefreshCw, Users } from 'lucide-react'
import { ResolvedAttendanceDay, formatAttendanceTime } from '@/lib/attendance'
import { buildAgentAttendanceClipboard } from '@/lib/attendanceClipboard'
import AttendanceState from './AttendanceState'
import AttendanceStatusBadge, { attendanceReviewPriority } from './AttendanceStatusBadge'

type Props = { currentShiftDate: string }
type Tracker = { text: string; rowCount: number; lines: Array<{ agentName: string; field: string; value: string }> }

const copyText = async (value: string) => navigator.clipboard.writeText(value)
type SortMode = 'review' | 'tracker' | 'agent' | 'status'

const copyAgentTrackerCells = async (day: ResolvedAttendanceDay) => {
  const { plainText, html } = buildAgentAttendanceClipboard(day)

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })])
      return
    } catch {
      // Some browsers allow plain clipboard text but reject custom HTML.
    }
  }
  await copyText(plainText)
}

export default function TeamAttendanceListView({ currentShiftDate }: Props) {
  const [shiftDate, setShiftDate] = useState(currentShiftDate)
  const [days, setDays] = useState<ResolvedAttendanceDay[]>([])
  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [orderIssues, setOrderIssues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedAgent, setCopiedAgent] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('review')
  const [statusFilter, setStatusFilter] = useState('all')
  const [networkStatuses, setNetworkStatuses] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/attendance?${new URLSearchParams({ shiftDate })}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load attendance')
      setDays(payload.days || [])
      setTracker(payload.tracker || null)
      setOrderIssues(payload.order?.issues || [])
      setNetworkStatuses(Object.fromEntries((payload.clockNetworkStatuses || []).map((entry: any) => [`${entry.agentEmail}|${entry.shiftDate}`, entry.networkStatus])))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load attendance')
    } finally {
      setLoading(false)
    }
  }, [shiftDate])

  useEffect(() => { void load() }, [load])

  const statusOptions = useMemo(() => Array.from(new Set(days.map((day) => day.status))).sort(), [days])
  const visibleDays = useMemo(() => {
    const trackerPosition = new Map(days.map((day, index) => [day.agent, index]))
    return days.filter((day) => statusFilter === 'all' || day.status === statusFilter).sort((first, second) => {
      if (sortMode === 'agent') return first.agentName.localeCompare(second.agentName)
      if (sortMode === 'status') return first.status.localeCompare(second.status) || first.agentName.localeCompare(second.agentName)
      if (sortMode === 'review') {
        return attendanceReviewPriority(first) - attendanceReviewPriority(second)
          || (trackerPosition.get(first.agent) || 0) - (trackerPosition.get(second.agent) || 0)
      }
      return (trackerPosition.get(first.agent) || 0) - (trackerPosition.get(second.agent) || 0)
    })
  }, [days, sortMode, statusFilter])

  const copyTracker = async () => {
    if (!tracker) return
    try {
      await copyText(tracker.text)
      setCopiedAgent('')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Clipboard access was denied by the browser.')
    }
  }

  const copyAgent = async (day: ResolvedAttendanceDay) => {
    try {
      await copyAgentTrackerCells(day)
      setCopied(false)
      setCopiedAgent(day.agent)
      window.setTimeout(() => setCopiedAgent((current) => current === day.agent ? '' : current), 1800)
    } catch {
      setError('Clipboard access was denied by the browser.')
    }
  }

  const reviewOvertime = async (day: ResolvedAttendanceDay, field: 'pre_shift' | 'post_shift', decision: 'approve' | 'reject') => {
    const key = `${day.agent}|${field}`; setReviewing(key); setError(null)
    try { const response = await fetch('/api/attendance/overtime-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentEmail: day.agent, shiftDate: day.shiftDate, field, decision, expectedUpdatedAt: day.updatedAt }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to review overtime'); await load() }
    catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : 'Unable to review overtime') }
    finally { setReviewing('') }
  }

  return (
    <section aria-labelledby="daily-attendance-heading">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary"><Users size={16} /> Daily attendance</div>
          <h2 id="daily-attendance-heading" className="font-hanken text-2xl font-bold text-on-surface">Shift log</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Normal/Graveyard uses the selected Eastern shift date; Overnight uses the following calendar date.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Show status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-[42px] rounded-lg border border-outline-variant/50 bg-surface px-3 text-sm font-medium text-on-surface"><option value="all">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-[42px] rounded-lg border border-outline-variant/50 bg-surface px-3 text-sm font-medium text-on-surface"><option value="review">Needs review first</option><option value="tracker">Tracker order</option><option value="agent">Agent A–Z</option><option value="status">Status A–Z</option></select></label>
          <label><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Shift date</span>
            <span className="flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface px-3 py-2"><CalendarDays size={17} className="text-primary" /><input type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="bg-transparent text-sm font-medium text-on-surface outline-none" /></span>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-[42px] items-center gap-2 rounded-lg border border-outline-variant/50 px-4 text-sm font-medium text-on-surface disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
          <button type="button" onClick={() => void copyTracker()} disabled={!tracker} className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary disabled:opacity-40"><Clipboard size={16} />{copied ? 'Copied' : 'Copy tracker column'}</button>
        </div>
      </div>

      {error ? <AttendanceState kind="error" title="Attendance could not be loaded" description={error} onRetry={() => void load()} /> : loading ? <AttendanceState kind="loading" title="Loading shift attendance" description={`Fetching records for ${shiftDate}.`} /> : (
        <>
          {orderIssues.length > 0 && <div className="mb-4 rounded-xl border border-warning/30 bg-warning-container/50 p-4 text-sm text-on-warning-container"><p className="font-semibold">Tracker output is blocked</p><ul className="mt-1 list-disc pl-5">{orderIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Attendance status summary">
            <button type="button" onClick={() => setStatusFilter('all')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${statusFilter === 'all' ? 'bg-primary text-on-primary ring-primary' : 'bg-surface-container-low text-on-surface-variant ring-outline-variant/40'}`}>All · {days.length}</button>
            {statusOptions.map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`inline-flex items-center gap-1 rounded-full ${statusFilter === status ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}><AttendanceStatusBadge status={status} /><span className="pr-1 text-xs font-bold text-on-surface-variant">{days.filter((day) => day.status === status).length}</span></button>)}
          </div>
          <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/85 shadow-sm">
            <div className="border-b border-outline-variant/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Showing {visibleDays.length} of {days.length} agents · {tracker?.rowCount || 0} tracker rows · full tracker copy stays in saved order</div>
            <div className="max-h-[calc(100vh-350px)] overflow-auto">
              <table className="w-full min-w-[920px]">
                <thead className="sticky top-0 z-10 bg-surface-container-low"><tr>{['Agent','Group','Calendar date','Schedule','Status','Time in','Time out','Clock review'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-outline-variant/20">{visibleDays.map((day) => (
                  <tr key={day.agent} className="hover:bg-info-container/50">
                    <td className="px-3 py-2"><button type="button" onClick={() => void copyAgent(day)} className="group text-left" title="Copy this agent's Time In and Time Out as two spreadsheet cells"><span className="flex items-center gap-1.5 text-sm font-semibold text-on-surface group-hover:text-primary">{day.agentName}<Copy size={13} aria-hidden="true" /></span><span className="block text-xs text-on-surface-variant">{day.agent}</span><span className="block text-[10px] font-semibold text-primary">{copiedAgent === day.agent ? 'Copied 2 cells' : 'Click to copy clocks'}</span></button></td>
                    <td className="px-3 py-2 text-xs text-on-surface-variant">{day.shiftGroup === 'overnight' ? 'Overnight' : 'Normal / Graveyard'}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-on-surface">{day.shiftDate}{day.shiftGroup === 'overnight' && <span className="ml-1 text-primary">(+1)</span>}</td>
                    <td className="px-3 py-2 text-xs text-on-surface-variant">{day.startShift || '—'} – {day.endShift || '—'}</td>
                    <td className="px-3 py-2"><AttendanceStatusBadge status={day.status} /></td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface" title={day.lateMinutes > 0 ? `${day.lateMinutes} minute${day.lateMinutes === 1 ? '' : 's'} late` : undefined}>{formatAttendanceTime(day.timeIn)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface" title={day.undertimeMinutes > 0 ? `${day.undertimeMinutes} minute${day.undertimeMinutes === 1 ? '' : 's'} undertime` : undefined}>{formatAttendanceTime(day.timeOut)}</td>
                    <td className="px-3 py-2 text-xs"><div className="space-y-1">{networkStatuses[`${day.agent}|${day.shiftDate}`] && <span className={`block rounded px-2 py-1 font-semibold ${networkStatuses[`${day.agent}|${day.shiftDate}`].includes('flagged') ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{networkStatuses[`${day.agent}|${day.shiftDate}`].replace(/_/g, ' ')}</span>}{day.preShiftOtReview === 'pending' && <div className="rounded border border-success/30 p-2"><p className="font-semibold">Pre-shift OT · {day.preShiftOtMinutes} min</p><div className="mt-1 flex gap-1"><button disabled={Boolean(reviewing)} onClick={() => void reviewOvertime(day, 'pre_shift', 'approve')} className="rounded bg-success-container px-2 py-1 font-semibold text-on-success-container">Approve</button><button disabled={Boolean(reviewing)} onClick={() => void reviewOvertime(day, 'pre_shift', 'reject')} className="rounded bg-surface-container-high px-2 py-1">Reject</button></div></div>}{day.postShiftOtReview === 'pending' && <div className="rounded border border-success/30 p-2"><p className="font-semibold">Post-shift OT · {day.postShiftOtMinutes} min</p><div className="mt-1 flex gap-1"><button disabled={Boolean(reviewing)} onClick={() => void reviewOvertime(day, 'post_shift', 'approve')} className="rounded bg-success-container px-2 py-1 font-semibold text-on-success-container">Approve</button><button disabled={Boolean(reviewing)} onClick={() => void reviewOvertime(day, 'post_shift', 'reject')} className="rounded bg-surface-container-high px-2 py-1">Reject</button></div></div>}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          {tracker && <details className="mt-4 rounded-xl border border-outline-variant/30 bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-on-surface">Preview tracker row pairing</summary><div className="mt-3 max-h-64 overflow-auto font-mono text-xs">{tracker.lines.map((line, index) => <div key={`${line.agentName}-${line.field}`} className="grid grid-cols-[3rem_1fr_5rem_8rem] gap-2 border-b border-outline-variant/20 py-1"><span>{index + 1}</span><span>{line.agentName}</span><span>{line.field}</span><span>{line.value || '(blank)'}</span></div>)}</div></details>}
        </>
      )}
      {copied && <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 rounded-lg bg-on-surface px-4 py-3 text-sm font-medium text-background shadow-xl"><Check size={17} />Copied {tracker?.rowCount} rows</div>}
      {copiedAgent && <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 rounded-lg bg-on-surface px-4 py-3 text-sm font-medium text-background shadow-xl"><Check size={17} />Copied Time In and Time Out</div>}
    </section>
  )
}
