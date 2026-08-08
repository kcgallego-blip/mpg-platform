'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import Navigation from '@/components/Navigation'
import { useFeatureSettingsStore } from '@/lib/featureSettingsStore'
import { useRequireAuth } from '@/lib/useRequireAuth'
import { useEffect } from 'react'
import { getPostLoginRoute } from '@/lib/routes'

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  const { user, isReady } = useRequireAuth()
  const canAccessAttendance = useFeatureSettingsStore(
    (state) => state.canAccessAttendance
  )
  const loadedFor = useFeatureSettingsStore((state) => state.loadedFor)
  const settingsError = useFeatureSettingsStore((state) => state.error)
  const loadFeatureSettings = useFeatureSettingsStore((state) => state.load)
  const isAdmin = user?.role === 'Admin'
  const settingsReady = loadedFor === user?.email

  useEffect(() => {
    if (isReady && user?.email && !isAdmin) {
      void loadFeatureSettings(user.email)
    }
  }, [isAdmin, isReady, loadFeatureSettings, user?.email])

  if (!isReady || (!isAdmin && !settingsReady && !settingsError)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center" role="status">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
          <p className="text-on-surface-variant">Loading attendance...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin && (!settingsReady || !canAccessAttendance)) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="ml-64 flex min-h-[calc(100vh-5rem)] items-center justify-center px-gutter">
          <div className="max-w-md rounded-2xl border border-error/20 bg-white/80 p-8 text-center shadow-sm">
            <ShieldX size={36} className="mx-auto mb-4 text-error" />
            <h1 className="font-hanken text-2xl font-bold text-on-surface">
              Attendance is unavailable
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              The public Attendance route is currently disabled by an administrator.
            </p>
            <Link
              href={getPostLoginRoute(user?.role)}
              className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
            >
              Return home
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="ml-64 px-gutter pb-10 pt-8">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  )
}
