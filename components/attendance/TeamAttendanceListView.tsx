'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Clipboard, RefreshCw, Users } from 'lucide-react'
import { ResolvedAttendanceDay, formatAttendanceTime } from '@/lib/attendance'
import AttendanceState from './AttendanceState'

type Props = { currentShiftDate: string }
type Tracker = { text: string; rowCount: number; lines: Array<{ agentName: string; field: string; value: string }> }

const copyText = async (value: string) => navigator.clipboard.writeText(value)

export default function TeamAttendanceListView({ currentShiftDate }: Props) {
  const [shiftDate, setShiftDate] = useState(currentShiftDate)
  const [days, setDays] = useState<ResolvedAttendanceDay[]>([])
  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [orderIssues, setOrderIssues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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

  const copyTracker = async () => {
    if (!tracker) return
    try {
      await copyText(tracker.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
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
          <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/85 shadow-sm">
            <div className="border-b border-outline-variant/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{days.length} agents · {tracker?.rowCount || 0} tracker rows</div>
            <div className="max-h-[calc(100vh-350px)] overflow-auto">
              <table className="w-full min-w-[920px]">
                <thead className="sticky top-0 z-10 bg-surface-container-low"><tr>{['Agent','Group','Calendar date','Schedule','Status','Time in','Time out','Clock review'].map((heading) => <th key={heading} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-outline-variant/20">{days.map((day) => (
                  <tr key={day.agent} className="hover:bg-info-container/50">
                    <td className="px-3 py-2"><div className="text-sm font-semibold text-on-surface">{day.agentName}</div><div className="text-xs text-on-surface-variant">{day.agent}</div></td>
                    <td className="px-3 py-2 text-xs text-on-surface-variant">{day.shiftGroup === 'overnight' ? 'Overnight' : 'Normal / Graveyard'}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-on-surface">{day.shiftDate}{day.shiftGroup === 'overnight' && <span className="ml-1 text-primary">(+1)</span>}</td>
                    <td className="px-3 py-2 text-xs text-on-surface-variant">{day.startShift || '—'} – {day.endShift || '—'}</td>
                    <td className="px-3 py-2"><span className="rounded-full bg-surface-container-high px-2 py-1 text-xs font-semibold text-on-surface">{day.status}</span></td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface">{formatAttendanceTime(day.timeIn)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface">{formatAttendanceTime(day.timeOut)}</td>
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
    </section>
  )
}
