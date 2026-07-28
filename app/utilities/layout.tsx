'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { useEffect } from 'react'
import Navigation from '@/components/Navigation'
import { useFeatureSettingsStore } from '@/lib/featureSettingsStore'
import { useRequireAuth } from '@/lib/useRequireAuth'

export default function UtilitiesLayout({ children }: { children: ReactNode }) {
  const { user, isReady } = useRequireAuth()
  const serverIsAdmin = useFeatureSettingsStore((state) => state.isAdmin)
  const settingsLoadedFor = useFeatureSettingsStore((state) => state.loadedFor)
  const settingsError = useFeatureSettingsStore((state) => state.error)
  const loadFeatureSettings = useFeatureSettingsStore((state) => state.load)
  const needsServerRoleCheck =
    user?.role === 'Admin' &&
    settingsLoadedFor !== user.email &&
    !settingsError

  useEffect(() => {
    if (isReady && user?.email && user.role === 'Admin') {
      void loadFeatureSettings(user.email)
    }
  }, [isReady, loadFeatureSettings, user?.email, user?.role])

  if (!isReady || needsServerRoleCheck) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center" role="status">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
          <p className="text-on-surface-variant">Loading controls...</p>
        </div>
      </div>
    )
  }

  if (
    user?.role !== 'Admin' ||
    settingsLoadedFor !== user.email ||
    !serverIsAdmin
  ) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="ml-64 flex min-h-[calc(100vh-5rem)] items-center justify-center px-gutter">
          <div className="max-w-md rounded-2xl border border-error/20 bg-white/80 p-8 text-center shadow-sm">
            <ShieldX size={36} className="mx-auto mb-4 text-error" />
            <h1 className="font-hanken text-2xl font-bold text-on-surface">
              Administrator access required
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              Controls are available only to users with the Admin role.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
            >
              Return to dashboard
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
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
