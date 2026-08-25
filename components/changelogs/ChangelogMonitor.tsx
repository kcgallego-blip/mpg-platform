'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, History, Loader2, Sparkles, X } from 'lucide-react'
import ChangelogReleaseCard from './ChangelogReleaseCard'
import {
  acknowledgeChangelogs,
  fetchChangelogStatus,
  fetchUnseenChangelogs,
} from '@/lib/changelogClient'
import type { ChangelogRelease } from '@/lib/changelog'
import { CHANGELOG_SYNC_STORAGE_KEY } from '@/lib/changelog'
import {
  getNextManilaSixPm,
  isScheduledChangelogCheckDue,
} from '@/lib/changelogSchedule'
import { useAuthStore } from '@/lib/authStore'

const LAST_CHECK_PREFIX = 'mpg_changelog_last_check:'
const RETRY_DELAY_MS = 60 * 1000

type ChangelogSyncEvent = {
  email: string
  sequence: number
  timestamp: number
  nonce: string
}

function lastCheckKey(email: string) {
  return `${LAST_CHECK_PREFIX}${email.trim().toLowerCase()}`
}

function readLastSuccessfulCheck(email: string) {
  try {
    const value = Number(localStorage.getItem(lastCheckKey(email)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function recordSuccessfulCheck(email: string) {
  try {
    localStorage.setItem(lastCheckKey(email), String(Date.now()))
  } catch {
    // The server cursor remains authoritative if browser storage is blocked.
  }
}

function broadcastAcknowledgement(email: string, sequence: number) {
  try {
    const event: ChangelogSyncEvent = {
      email: email.trim().toLowerCase(),
      sequence,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).slice(2),
    }
    localStorage.setItem(CHANGELOG_SYNC_STORAGE_KEY, JSON.stringify(event))
  } catch {
    // Other tabs will reconcile during their next scheduled status check.
  }
}

function parseSyncEvent(value: string | null): ChangelogSyncEvent | null {
  if (!value) return null
  try {
    const event = JSON.parse(value) as Partial<ChangelogSyncEvent>
    if (
      typeof event.email === 'string' &&
      typeof event.sequence === 'number' &&
      Number.isSafeInteger(event.sequence) &&
      typeof event.timestamp === 'number' &&
      typeof event.nonce === 'string'
    ) {
      return event as ChangelogSyncEvent
    }
  } catch {
    // Ignore malformed cross-tab events.
  }
  return null
}

export default function ChangelogMonitor() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const [releases, setReleases] = useState<ChangelogRelease[]>([])
  const [acknowledging, setAcknowledging] = useState(false)
  const [acknowledgementError, setAcknowledgementError] = useState<string | null>(null)
  const checkInFlight = useRef(false)
  const retryNeeded = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkRef = useRef<() => Promise<void>>(async () => undefined)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  const email = user?.email?.trim().toLowerCase() || ''

  const checkForUpdates = useCallback(async () => {
    if (!email || checkInFlight.current) return
    checkInFlight.current = true

    try {
      const status = await fetchChangelogStatus()
      if (status.hasUnseen) {
        const page = await fetchUnseenChangelogs(status.lastSeenSequence)
        setReleases(page.items)
      } else {
        setReleases([])
      }
      retryNeeded.current = false
      recordSuccessfulCheck(email)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = null
    } catch {
      retryNeeded.current = true
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        !retryTimer.current
      ) {
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null
          void checkRef.current()
        }, RETRY_DELAY_MS)
      }
    } finally {
      checkInFlight.current = false
    }
  }, [email])

  checkRef.current = checkForUpdates

  useEffect(() => {
    setReleases([])
    setAcknowledgementError(null)
    if (!email) return

    void checkForUpdates()

    let dailyTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    const scheduleDailyCheck = () => {
      if (cancelled) return
      const delay = Math.max(1000, getNextManilaSixPm() - Date.now())
      dailyTimer = setTimeout(() => {
        void checkForUpdates().finally(() => {
          if (!cancelled) scheduleDailyCheck()
        })
      }, delay)
    }
    scheduleDailyCheck()

    const checkIfScheduleWasMissed = () => {
      if (
        document.visibilityState === 'visible' &&
        isScheduledChangelogCheckDue(readLastSuccessfulCheck(email))
      ) {
        void checkForUpdates()
      }
    }
    const handleVisibility = () => checkIfScheduleWasMissed()
    const handleOnline = () => {
      if (retryNeeded.current || isScheduledChangelogCheckDue(readLastSuccessfulCheck(email))) {
        void checkForUpdates()
      }
    }

    window.addEventListener('focus', checkIfScheduleWasMissed)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      if (dailyTimer) clearTimeout(dailyTimer)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = null
      window.removeEventListener('focus', checkIfScheduleWasMissed)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [checkForUpdates, email])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CHANGELOG_SYNC_STORAGE_KEY) return
      const syncEvent = parseSyncEvent(event.newValue)
      if (!syncEvent || syncEvent.email !== email) return
      setReleases((current) => current.filter(
        (release) => release.sequence > syncEvent.sequence
      ))
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [email])

  useEffect(() => {
    if (releases.length === 0) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !acknowledging) {
        event.preventDefault()
        void acknowledgeAndClose()
        return
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
          ) || []
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  // acknowledgeAndClose intentionally reads the latest displayed releases.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acknowledging, releases.length])

  const acknowledgeAndClose = async (openHistory = false) => {
    if (!email || releases.length === 0 || acknowledging) return
    const highestDisplayedSequence = Math.max(...releases.map((release) => release.sequence))
    setAcknowledging(true)
    setAcknowledgementError(null)

    try {
      const result = await acknowledgeChangelogs(highestDisplayedSequence)
      setReleases((current) => current.filter(
        (release) => release.sequence > result.lastSeenSequence
      ))
      broadcastAcknowledgement(email, result.lastSeenSequence)
      recordSuccessfulCheck(email)
      if (openHistory) router.push('/changelogs')
    } catch (error) {
      setAcknowledgementError(
        error instanceof Error ? error.message : 'Unable to mark changelogs as read'
      )
    } finally {
      setAcknowledging(false)
    }
  }

  if (!email || releases.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !acknowledging) {
          void acknowledgeAndClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant bg-primary-container px-6 py-5 text-on-primary-container">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-on-primary-container/15 p-2">
              <Sparkles size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 id="changelog-modal-title" className="font-hanken text-2xl font-bold">
                What&apos;s new
              </h1>
              <p className="mt-1 text-sm text-on-primary-container/80">
                {releases.length === 1
                  ? 'A new release is ready.'
                  : `${releases.length} releases were published since your last visit.`}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Mark all displayed changelogs as read and close"
            disabled={acknowledging}
            onClick={() => void acknowledgeAndClose()}
            className="rounded-lg p-2 text-on-primary-container transition-colors hover:bg-on-primary-container/15 disabled:opacity-50"
          >
            {acknowledging ? <Loader2 size={20} className="animate-spin" /> : <X size={20} />}
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto bg-surface-dim p-5 sm:p-6">
          {releases.map((release) => (
            <ChangelogReleaseCard key={release.sequence} release={release} compact />
          ))}
        </div>

        <footer className="border-t border-outline-variant bg-surface px-6 py-4">
          {acknowledgementError && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container" role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              {acknowledgementError}. Please try again.
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={acknowledging}
              onClick={() => void acknowledgeAndClose(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
            >
              <History size={18} aria-hidden="true" />
              View full history
            </button>
            <button
              type="button"
              disabled={acknowledging}
              onClick={() => void acknowledgeAndClose()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary-container transition-colors hover:bg-inverse-primary disabled:opacity-50"
            >
              {acknowledging && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
              Skip all &amp; mark read
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
