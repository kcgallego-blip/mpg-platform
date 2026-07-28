'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, Clipboard, RefreshCw, Users } from 'lucide-react'
import { AttendanceRecord, formatAttendanceTime } from '@/lib/attendance'
import AttendanceState from './AttendanceState'

type TeamAttendanceListViewProps = {
  currentShiftDate: string
}

const copyPlainText = async (value: string) => {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const plainText = new Blob([value], { type: 'text/plain' })
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': plainText })])
    return
  }

  await navigator.clipboard.writeText(value)
}

export default function TeamAttendanceListView({
  currentShiftDate,
}: TeamAttendanceListViewProps) {
  const [shiftDate, setShiftDate] = useState(currentShiftDate)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)

  const loadAttendance = useCallback(async () => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ shiftDate })
      const response = await fetch(`/api/attendance?${params.toString()}`, {
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load team attendance')
      }

      if (currentRequestId === requestId.current) {
        setRecords(payload.records || [])
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load team attendance')
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false)
      }
    }
  }, [shiftDate])

  useEffect(() => {
    void loadAttendance()
  }, [loadAttendance])

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    []
  )

  const handleCopy = async (timestamp: string | null) => {
    const value = formatAttendanceTime(timestamp)
    if (value === '--') return

    try {
      await copyPlainText(value)
      setCopiedValue(value)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setCopiedValue(null), 1800)
    } catch {
      setError('Clipboard access was denied by the browser.')
    }
  }

  return (
    <section aria-labelledby="team-attendance-heading">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-primary">
            <Users size={16} />
            Team attendance
          </div>
          <h1
            id="team-attendance-heading"
            className="font-hanken text-3xl font-bold text-on-surface"
          >
            Shift log
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Review team clock-ins and clock-outs for a UTC-8 shift date.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Shift date
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-white px-3 py-2">
              <CalendarDays size={17} className="text-primary" />
              <input
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                className="bg-transparent text-sm font-medium text-on-surface outline-none"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => void loadAttendance()}
            disabled={loading}
            className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
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
      ) : loading ? (
        <AttendanceState
          kind="loading"
          title="Loading shift attendance"
          description={`Fetching team records for ${shiftDate}.`}
        />
      ) : records.length === 0 ? (
        <AttendanceState
          kind="empty"
          title="No attendance records"
          description={`No team logs were found for ${shiftDate}.`}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white/85 shadow-sm">
          <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low/70 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {records.length} agent{records.length === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1 text-xs text-on-surface-variant">
              <Clipboard size={13} />
              Select a time to copy
            </span>
          </div>
          <div className="max-h-[calc(100vh-310px)] overflow-auto">
            <table className="w-full min-w-[640px] table-fixed">
              <thead className="sticky top-0 z-10 bg-surface-container-low shadow-sm">
                <tr>
                  <th className="w-3/5 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    Agent / ID
                  </th>
                  <th className="w-1/5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    Time in
                  </th>
                  <th className="w-1/5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    Time out
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {records.map((record) => (
                  <tr
                    key={`${record.agent}-${record.shift_date}`}
                    className="transition-colors hover:bg-blue-50/60"
                  >
                    <td className="truncate px-4 py-2 text-sm font-medium text-on-surface" title={record.agent}>
                      {record.agent}
                    </td>
                    <TimeCell value={record.time_in} label={`Copy time in for ${record.agent}`} onCopy={handleCopy} />
                    <TimeCell value={record.time_out} label={`Copy time out for ${record.agent}`} onCopy={handleCopy} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {copiedValue && (
        <div
          className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 rounded-lg bg-on-surface px-4 py-3 text-sm font-medium text-white shadow-xl"
          role="status"
          aria-live="polite"
        >
          <Check size={17} className="text-green-300" />
          Copied {copiedValue}
        </div>
      )}
    </section>
  )
}

function TimeCell({
  value,
  label,
  onCopy,
}: {
  value: string | null
  label: string
  onCopy: (value: string | null) => void
}) {
  const formatted = formatAttendanceTime(value)
  const canCopy = formatted !== '--'

  return (
    <td className="px-3 py-1.5">
      <button
        type="button"
        onClick={() => void onCopy(value)}
        disabled={!canCopy}
        aria-label={canCopy ? label : `${label}: no value`}
        className={`rounded-md px-2 py-1 font-mono text-xs font-semibold transition-colors ${
          canCopy
            ? 'cursor-copy text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30'
            : 'cursor-default text-on-surface-variant/60'
        }`}
      >
        {formatted}
      </button>
    </td>
  )
}
