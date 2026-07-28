'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, LogIn, LogOut } from 'lucide-react'
import {
  AttendanceRecord,
  formatAttendanceTime,
  getMonthRange,
  parseDateKey,
  toDateKey,
} from '@/lib/attendance'
import AttendanceState from './AttendanceState'

type AgentCalendarViewProps = {
  currentShiftDate: string
}

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AgentCalendarView({ currentShiftDate }: AgentCalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const current = parseDateKey(currentShiftDate)
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const monthRange = useMemo(() => getMonthRange(visibleMonth), [visibleMonth])

  const loadAttendance = useCallback(async () => {
    const currentRequestId = ++requestId.current

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams(monthRange)
      const response = await fetch(`/api/attendance?${params.toString()}`, {
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load your attendance')
      }

      if (currentRequestId === requestId.current) {
        setRecords(payload.records || [])
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
  }, [monthRange])

  useEffect(() => {
    void loadAttendance()
  }, [loadAttendance])

  const recordByDate = useMemo(
    () => new Map(records.map((record) => [record.shift_date, record])),
    [records]
  )

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
            Personal attendance
          </div>
          <h1
            id="attendance-calendar-heading"
            className="font-hanken text-3xl font-bold text-on-surface"
          >
            {monthLabel}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Current shift date: {currentShiftDate} (UTC-8)
          </p>
        </div>

        <div className="inline-flex w-fit items-center rounded-xl border border-outline-variant/40 bg-white p-1 shadow-sm">
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
              const current = parseDateKey(currentShiftDate)
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
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-white/80 shadow-sm">
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
                  const isCurrent = dateKey === currentShiftDate

                  return (
                    <article
                      key={dateKey}
                      className={`min-h-32 border-b border-r border-outline-variant/20 p-3 transition-colors ${
                        isCurrent ? 'bg-primary/10 ring-2 ring-inset ring-primary/50' : 'hover:bg-blue-50/50'
                      }`}
                      aria-current={isCurrent ? 'date' : undefined}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                            isCurrent ? 'bg-primary text-on-primary' : 'text-on-surface'
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
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-on-surface-variant">
                            <LogIn size={13} />
                            In
                          </span>
                          <span className="font-semibold text-on-surface">
                            {formatAttendanceTime(record?.time_in || null)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-on-surface-variant">
                            <LogOut size={13} />
                            Out
                          </span>
                          <span className="font-semibold text-on-surface">
                            {formatAttendanceTime(record?.time_out || null)}
                          </span>
                        </div>
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
