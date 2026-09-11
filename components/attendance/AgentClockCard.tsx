'use client'

import { Clock3, Loader2, LogIn, LogOut, RefreshCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentClockState, ClockSurface } from '@/lib/attendanceClock'
import { formatAttendanceTime12Hour } from '@/lib/attendance'

const networkLabels: Record<NonNullable<AgentClockState['networkStatus']>, string> = {
  office: 'Office network',
  wfh_exempt: 'WFH verified',
  offsite_flagged: 'Offsite IP — review',
  unknown_ip_flagged: 'Unknown IP — review',
  unconfigured: 'Network detection not configured',
}
const networkText = (status: AgentClockState['networkStatus']) => status ? networkLabels[status] : ''

export default function AgentClockCard({ surface, variant = 'card', onChanged }: {
  surface: ClockSurface
  variant?: 'card' | 'cell'
  onChanged?: () => void | Promise<void>
}) {
  const [state, setState] = useState<AgentClockState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/attendance/clock', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load attendance clock')
      setState(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load attendance clock')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const focus = () => {
      void load()
      if (surface === 'attendance') void onChanged?.()
    }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [load, onChanged, surface])

  const clock = async () => {
    if (!state?.action || inFlight.current) return
    inFlight.current = true; setSaving(true); setError('')
    try {
      const statusResponse = await fetch('/api/attendance/clock', { cache: 'no-store' })
      const currentState = await statusResponse.json()
      if (!statusResponse.ok) throw new Error(currentState.error || 'Unable to refresh attendance clock')
      setState(currentState)
      if (!currentState.action || currentState.action !== state.action) throw new Error('Attendance changed. Review the refreshed clock state before continuing.')
      const confirmation = `${currentState.actionLabel} using server time ${currentState.serverTimestamp}\nResolved attendance date: ${currentState.shiftDate}\nSchedule: ${currentState.startShift || '—'} – ${currentState.endShift || '—'}\nNetwork: ${networkText(currentState.networkStatus)}`
      if (!window.confirm(confirmation)) return
      const response = await fetch('/api/attendance/clock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: currentState.action, surface, requestId: crypto.randomUUID() }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save clock action')
      setState(payload)
      await onChanged?.()
    } catch (clockError) {
      setError(clockError instanceof Error ? clockError.message : 'Unable to save clock action')
      await load()
    } finally { inFlight.current = false; setSaving(false) }
  }

  if (loading && variant === 'cell') return <div className="mt-2 flex justify-center"><Loader2 size={14} className="animate-spin text-primary" /></div>
  if (!state?.enabled && !error) return null

  if (variant === 'cell') return <div className="mt-2 border-t border-outline-variant/30 pt-2 font-sans">
    {state?.action && <button type="button" onClick={() => void clock()} disabled={saving} className={`flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${state.isRdot ? 'bg-success-container text-on-success-container' : 'bg-primary text-on-primary'} disabled:opacity-50`}>{saving ? <Loader2 size={12} className="animate-spin" /> : state.action === 'time_in' ? <LogIn size={12} /> : <LogOut size={12} />}{saving ? 'Saving…' : state.actionLabel}</button>}
    {!state?.action && state?.blockedReason && <p className="text-[10px] leading-tight text-warning">{state.blockedReason}</p>}
    {error && <button type="button" onClick={() => void load()} className="text-[10px] font-semibold text-error">{error} · Retry</button>}
  </div>

  return <section className="rounded-2xl border border-outline-variant/30 bg-surface/90 p-5 shadow-sm" aria-labelledby="home-attendance-clock">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-primary"><Clock3 size={17} />Today’s attendance</div><h2 id="home-attendance-clock" className="mt-1 font-hanken text-xl font-bold text-on-surface">{state?.isRdot ? 'Rest Day Overtime' : state?.status || 'Attendance clock'}</h2><p className="mt-1 text-xs text-on-surface-variant">Eastern attendance date {state?.shiftDate || '—'} · {state?.startShift || '—'} – {state?.endShift || '—'}</p></div>
      {state?.networkStatus && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.networkStatus.includes('flagged') ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{networkText(state.networkStatus)}</span>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-surface-container-low p-3"><p className="text-xs text-on-surface-variant">Time In</p><p className="mt-1 font-mono text-sm font-bold text-on-surface">{formatAttendanceTime12Hour(state?.timeIn || null)}</p></div><div className="rounded-lg bg-surface-container-low p-3"><p className="text-xs text-on-surface-variant">Time Out</p><p className="mt-1 font-mono text-sm font-bold text-on-surface">{formatAttendanceTime12Hour(state?.timeOut || null)}</p></div></div>
    {(state?.preShiftOtReview === 'pending' || state?.postShiftOtReview === 'pending') && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-warning"><ShieldAlert size={14} />Overtime is pending management approval.</p>}
    {state?.action && <button type="button" onClick={() => void clock()} disabled={saving} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold ${state.isRdot ? 'bg-success-container text-on-success-container' : 'bg-primary text-on-primary'} disabled:opacity-50`}>{saving ? <Loader2 size={17} className="animate-spin" /> : state.action === 'time_in' ? <LogIn size={17} /> : <LogOut size={17} />}{saving ? 'Saving…' : state.actionLabel}</button>}
    {!state?.action && state?.blockedReason && <p className="mt-3 text-sm text-warning">{state.blockedReason}</p>}
    {error && <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-error"><RefreshCw size={15} />{error}</button>}
  </section>
}
