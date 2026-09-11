'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Sparkles } from 'lucide-react'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { getPostLoginRoute } from '@/lib/routes'
import { getAgentFirstName, getDailyFallbackHomeMessage, getManilaDateKey } from '@/lib/homeInsights'
import { getIsoWeekAtUtcOffset, type IsoWeek } from '@/lib/isoWeek'
import AgentClockCard from '@/components/attendance/AgentClockCard'

type HomeMessageResponse = {
  message?: string
  generatedAt?: string
  error?: string
}

export default function AgentHomePage() {
  const router = useRouter()
  const { user, isReady } = useRequireAuth()
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [currentWeek, setCurrentWeek] = useState<IsoWeek | null>(null)
  const loadedMessageDate = useRef('')

  const isAgent = user?.role?.trim().toLowerCase() === 'agent'
  const firstName = getAgentFirstName(user?.name)

  const loadMessage = useCallback(async () => {
    if (!user || !isAgent) return

    const messageDate = getManilaDateKey()
    try {
      setIsLoading(true)

      const response = await fetch('/api/home/message', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
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
      if (!response.ok || !data.message) {
        throw new Error(data.error || 'Your AI message is temporarily unavailable')
      }

      setMessage(data.message)
    } catch {
      setMessage(getDailyFallbackHomeMessage(user.name, messageDate))
    } finally {
      loadedMessageDate.current = messageDate
      setIsLoading(false)
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
    if (!isReady || !user || !isAgent) return
    const refreshOnNewDay = () => {
      const currentDate = getManilaDateKey()
      if (loadedMessageDate.current && loadedMessageDate.current !== currentDate) void loadMessage()
    }
    const interval = window.setInterval(refreshOnNewDay, 60_000)
    window.addEventListener('focus', refreshOnNewDay)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnNewDay)
    }
  }, [isAgent, isReady, loadMessage, user])

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
        aria-busy={isLoading}
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
            ) : (
              <div>
                <p className="font-hanken text-title-lg font-semibold leading-relaxed text-on-surface">
                  {message}
                </p>
                <p className="mt-2 text-xs font-medium text-on-surface-variant">Updates daily.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
