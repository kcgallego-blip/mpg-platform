'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, LogIn, LogOut } from 'lucide-react'
import {
  AttendanceRecord,
  AttendanceDayStatus,
  ResolvedAttendanceDay,
  formatAttendanceTime12Hour,
  getMonthRange,
  parseDateKey,
  toDateKey,
} from '@/lib/attendance'
import AttendanceState from './AttendanceState'
import AgentClockCard from './AgentClockCard'

type AgentCalendarViewProps = {
  currentShiftDate: string
  agentEmail?: string
  agentName?: string
}

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HIDE_CLOCK_STATUSES = new Set<AttendanceDayStatus>([
  'Day Off',
  'Holiday Off',
  'Vacation Leave',
  'Sick Leave',
  'Leave',
  'Transition Off',
  'Absent',
])

const calendarTone = (status?: AttendanceDayStatus) => {
  if (status?.startsWith('RDOT')) return {
    cell: 'bg-success-container/70 hover:bg-success-container/85',
    text: 'text-on-success-container',
    muted: 'text-on-success-container/80',
    badge: 'border border-success/30 bg-success-container text-on-success-container',
  }
  if (status === 'Vacation Leave' || status === 'Leave') return {
    cell: 'bg-info-container/70 hover:bg-info-container/85',
    text: 'text-on-info-container',
    muted: 'text-on-info-container/80',
    badge: 'border border-info/30 bg-info-container text-on-info-container',
  }
  if (status === 'Sick Leave') return {
    cell: 'bg-warning-container/70 hover:bg-warning-container/85',
    text: 'text-on-warning-container',
    muted: 'text-on-warning-container/80',
    badge: 'border border-warning/30 bg-warning-container text-on-warning-container',
  }
  if (status === 'Absent') return {
    cell: 'bg-error-container/70 hover:bg-error-container/85',
    text: 'text-on-error-container',
    muted: 'text-on-error-container/80',
    badge: 'border border-error/30 bg-error-container text-on-error-container',
  }
  if (status === 'Day Off' || status === 'Holiday Off' || status === 'Transition Off') return {
    cell: 'bg-surface-container-high/80 hover:bg-surface-container-high',
    text: 'text-on-surface',
    muted: 'text-on-surface-variant',
    badge: 'border border-outline-variant/40 bg-surface text-on-surface-variant',
  }
  return {
    cell: 'hover:bg-info-container/50',
    text: 'text-on-surface',
    muted: 'text-on-surface-variant',
    badge: 'bg-surface-container-high text-on-surface-variant',
  }
}

type TimingLabel = { text: string; title?: string; tone: 'overtime' | 'warning' }

const durationText = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${minutes}m`
}

const timingTooltip = (label: string, minutes: number) => (
  minutes > 60 ? `${label}: ${durationText(minutes)} (${minutes} minutes)` : undefined
)

const timingLabels = (day?: ResolvedAttendanceDay) => {
  const applies = Boolean(day && !day.status.startsWith('RDOT') && !HIDE_CLOCK_STATUSES.has(day.status))
  if (!day || !applies) return { timeIn: null, timeOut: null }

  const timeIn: TimingLabel | null = day.preShiftOtApproved && day.preShiftOtMinutes >= 120
    ? { text: `Pre-shift OT · ${day.preShiftOtMinutes} min`, title: timingTooltip('Pre-shift OT', day.preShiftOtMinutes), tone: 'overtime' }
    : day.lateMinutes > 0
      ? { text: `Late · ${day.lateMinutes} min`, title: timingTooltip('Late', day.lateMinutes), tone: 'warning' }
      : null
  const timeOut: TimingLabel | null = day.postShiftOtApproved && day.postShiftOtMinutes >= 120
    ? { text: `Post-shift OT · ${day.postShiftOtMinutes} min`, title: timingTooltip('Post-shift OT', day.postShiftOtMinutes), tone: 'overtime' }
    : day.undertimeMinutes > 0
      ? { text: `Undertime · ${day.undertimeMinutes} min`, title: timingTooltip('Undertime', day.undertimeMinutes), tone: 'warning' }
      : null

  return { timeIn, timeOut }
}

function TimingBadge({ value }: { value: TimingLabel }) {
  const colors = value.tone === 'overtime'
    ? 'border-success/35 bg-success-container text-on-success-container'
    : 'border-warning/35 bg-warning-container text-on-warning-container'
  return <div title={value.title} className={`mt-1 truncate rounded border px-1.5 py-0.5 font-sans text-[10px] font-bold ${colors}`}>
    {value.text}
  </div>
}

export default function AgentCalendarView({ currentShiftDate, agentEmail, agentName }: AgentCalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const current = parseDateKey(currentShiftDate)
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [days, setDays] = useState<ResolvedAttendanceDay[]>([])
  const [currentCalendarDate, setCurrentCalendarDate] = useState(currentShiftDate)
  const [clockDate, setClockDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const alignedCurrentMonth = useRef(false)

  const monthRange = useMemo(() => getMonthRange(visibleMonth), [visibleMonth])

  const loadAttendance = useCallback(async () => {
    const currentRequestId = ++requestId.current

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams(monthRange)
      if (agentEmail) params.set('agentEmail', agentEmail)
      const clockResponsePromise = agentEmail ? null : fetch('/api/attendance/clock', { cache: 'no-store' })
      const response = await fetch(`/api/attendance?${params.toString()}`, {
        cache: 'no-store',
      })
      const payload = await response.json()
      const clockResponse = clockResponsePromise ? await clockResponsePromise : null
      const clockPayload = clockResponse ? await clockResponse.json().catch(() => null) : null

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load your attendance')
      }

      if (currentRequestId === requestId.current) {
        setRecords(payload.records || [])
        setDays(payload.days || [])
        const resolvedClockDate = clockResponse?.ok && typeof clockPayload?.shiftDate === 'string'
          ? clockPayload.shiftDate
          : typeof payload.currentCalendarDate === 'string' ? payload.currentCalendarDate : null
        setClockDate(resolvedClockDate)
        if (typeof payload.currentCalendarDate === 'string') {
          setCurrentCalendarDate(payload.currentCalendarDate)
          if (!alignedCurrentMonth.current) {
            alignedCurrentMonth.current = true
            const markedDateKey = resolvedClockDate || payload.currentCalendarDate
            const markedDate = parseDateKey(markedDateKey)
            if (markedDateKey.slice(0, 7) !== currentShiftDate.slice(0, 7)) {
              setVisibleMonth(new Date(markedDate.getFullYear(), markedDate.getMonth(), 1))
            }
          }
        }
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load your attendance')
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false)
      }
    }
  }, [agentEmail, currentShiftDate, monthRange])

  useEffect(() => {
    void loadAttendance()
  }, [loadAttendance])

  const recordByDate = useMemo(
    () => new Map(records.map((record) => [record.shift_date, record])),
    [records]
  )
  const dayByDate = useMemo(() => new Map(days.map((day) => [day.shiftDate, day])), [days])

  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leadingBlanks = new Date(year, month, 1).getDay()

    return [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1)),
    ]
  }, [visibleMonth])

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth)

  const moveMonth = (offset: number) => {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    )
  }

  return (
    <section aria-labelledby="attendance-calendar-heading">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary">
            <Clock3 size={16} />
            {agentEmail ? 'Agent calendar' : 'Personal attendance'}
          </div>
          <h1
            id="attendance-calendar-heading"
            className="font-hanken text-3xl font-bold text-on-surface"
          >
            {agentName ? `${agentName} — ${monthLabel}` : monthLabel}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Current shift date: {currentShiftDate} · Marked calendar date: {currentCalendarDate} (America/New_York)
          </p>
        </div>

        <div className="inline-flex w-fit items-center rounded-xl border border-outline-variant/40 bg-surface p-1 shadow-sm">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              const current = parseDateKey(currentCalendarDate)
              setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1))
            }}
            className="min-w-32 rounded-lg px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {error ? (
        <AttendanceState
          kind="error"
          title="Attendance could not be loaded"
          description={error}
          onRetry={() => void loadAttendance()}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface/80 shadow-sm">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-outline-variant/30 bg-surface-container-low/70">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
                >
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <AttendanceState
                kind="loading"
                title="Loading attendance"
                description="Fetching your monthly time records."
              />
            ) : (
              <div className="grid grid-cols-7">
                {calendarDays.map((day, index) => {
                  if (!day) {
                    return (
                      <div
                        key={`blank-${index}`}
                        className="min-h-32 border-b border-r border-outline-variant/20 bg-surface-container-low/25"
                      />
                    )
                  }

                  const dateKey = toDateKey(day)
                  const record = recordByDate.get(dateKey)
                  const resolvedDay = dayByDate.get(dateKey)
                  const isCurrent = dateKey === currentCalendarDate
                  const tone = calendarTone(resolvedDay?.status)
                  const showClocks = !resolvedDay || !HIDE_CLOCK_STATUSES.has(resolvedDay.status)
                  const labels = timingLabels(resolvedDay)

                  return (
                    <article
                      key={dateKey}
                      className={`min-h-32 border-b border-r border-outline-variant/20 p-3 transition-colors ${tone.cell} ${isCurrent ? 'ring-2 ring-inset ring-primary/60' : ''}`}
                      aria-current={isCurrent ? 'date' : undefined}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                            isCurrent ? 'bg-primary text-on-primary' : tone.text
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 font-mono text-xs">
                        {resolvedDay && (
                          <div className={`mb-2 truncate rounded-md px-2 py-1 text-center font-sans text-[10px] font-bold uppercase tracking-wide ${tone.badge}`} title={resolvedDay.status}>
                            {resolvedDay.status}
                          </div>
                        )}
                        {showClocks && <div className="flex items-center justify-between gap-2">
                          <span className={`flex items-center gap-1 ${tone.muted}`}>
                            <LogIn size={13} />
                            In
                          </span>
                          <span className={`font-semibold ${tone.text}`}>
                            {formatAttendanceTime12Hour(record?.time_in || null)}
                          </span>
                        </div>}
                        {labels.timeIn && <TimingBadge value={labels.timeIn} />}
                        {showClocks && <div className="flex items-center justify-between gap-2">
                          <span className={`flex items-center gap-1 ${tone.muted}`}>
                            <LogOut size={13} />
                            Out
                          </span>
                          <span className={`font-semibold ${tone.text}`}>
                            {formatAttendanceTime12Hour(record?.time_out || null)}
                          </span>
                        </div>}
                        {labels.timeOut && <TimingBadge value={labels.timeOut} />}
                        {!agentEmail && dateKey === (clockDate || currentCalendarDate) && <AgentClockCard surface="attendance" variant="cell" onChanged={loadAttendance} />}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
