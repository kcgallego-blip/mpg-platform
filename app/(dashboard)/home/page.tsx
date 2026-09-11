'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarDays, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { getPostLoginRoute } from '@/lib/routes'
import { getAgentFirstName } from '@/lib/homeInsights'
import { getIsoWeekAtUtcOffset, type IsoWeek } from '@/lib/isoWeek'
import AgentClockCard from '@/components/attendance/AgentClockCard'

type HomeMessageResponse = {
  message?: string
  generatedAt?: string
  canRegenerate?: boolean
  error?: string
}

export default function AgentHomePage() {
  const router = useRouter()
  const { user, isReady } = useRequireAuth()
  const [message, setMessage] = useState('')
  const [canRegenerate, setCanRegenerate] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState('')
  const [currentWeek, setCurrentWeek] = useState<IsoWeek | null>(null)

  const isAgent = user?.role?.trim().toLowerCase() === 'agent'
  const firstName = getAgentFirstName(user?.name)

  const loadMessage = useCallback(async (regenerate = false) => {
    if (!user || !isAgent) return

    try {
      if (regenerate) {
        setIsRegenerating(true)
      } else {
        setIsLoading(true)
      }
      setError('')

      const response = await fetch('/api/home/message', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      })
      const data = await response.json().catch(() => ({})) as HomeMessageResponse

      if (response.status === 401) {
        router.replace('/login')
        return
      }
      if (response.status === 403) {
        router.replace(getPostLoginRoute(user.role))
        return
      }
      if (response.status === 409 && data.message) {
        setMessage(data.message)
        setCanRegenerate(false)
        return
      }
      if (!response.ok || !data.message) {
        throw new Error(data.error || 'Your AI message is temporarily unavailable')
      }

      setMessage(data.message)
      setCanRegenerate(data.canRegenerate === true)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Your AI message is temporarily unavailable'
      )
    } finally {
      setIsLoading(false)
      setIsRegenerating(false)
    }
  }, [isAgent, router, user])

  useEffect(() => {
    if (!isReady || !user) return

    if (!isAgent) {
      router.replace(getPostLoginRoute(user.role))
      return
    }

    void loadMessage()
  }, [isAgent, isReady, loadMessage, router, user])

  useEffect(() => {
    const updateCurrentWeek = () => setCurrentWeek(getIsoWeekAtUtcOffset(new Date(), -4))

    updateCurrentWeek()
    const interval = window.setInterval(updateCurrentWeek, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  if (!isReady || !user || !isAgent) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 size={36} className="animate-spin text-primary-container" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-label-md font-semibold uppercase tracking-wide text-primary-container">
            Home
          </p>
          <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
            Welcome back, {firstName}
          </h1>
        </div>

        {currentWeek ? (
          <div
            className="flex w-fit flex-none items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 sm:text-right"
            aria-label={`ISO 8601 week ${currentWeek.week} of ${currentWeek.year}, UTC minus 4`}
          >
            <CalendarDays size={20} className="text-primary-container" aria-hidden="true" />
            <p className="font-hanken text-title-md font-bold text-on-surface">
              Current Week: {currentWeek.week}
            </p>
          </div>
        ) : null}
      </header>

      <AgentClockCard surface="home" />

      <section
        aria-live="polite"
        aria-busy={isLoading || isRegenerating}
        className="relative overflow-hidden rounded-2xl border border-primary-container/20 bg-gradient-to-r from-primary-container/10 via-surface/90 to-inverse-primary/10 p-6 shadow-lg shadow-primary-container/5 sm:p-8"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-container/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary-container text-on-primary-container shadow-md">
            <Sparkles size={24} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-surface-container-high" />
                <div className="h-5 w-3/4 max-w-xl animate-pulse rounded bg-surface-container-high" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 text-on-surface">
                <AlertCircle size={22} className="mt-0.5 flex-none text-error" />
                <div>
                  <p className="font-semibold">Your AI message is temporarily unavailable.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{error}</p>
                </div>
              </div>
            ) : (
              <p className="font-hanken text-title-lg font-semibold leading-relaxed text-on-surface">
                {message}
              </p>
            )}
          </div>

          <div className="flex flex-none items-center gap-2">
            {error ? (
              <button
                type="button"
                onClick={() => void loadMessage(false)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition hover:border-primary-container hover:bg-surface-container-low"
              >
                <RefreshCw size={17} />
                Retry
              </button>
            ) : !isLoading ? (
              <button
                type="button"
                onClick={() => void loadMessage(true)}
                disabled={!canRegenerate || isRegenerating}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition hover:border-primary-container hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={17} className={isRegenerating ? 'animate-spin' : ''} />
                {isRegenerating ? 'Refreshing' : 'New message'}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
