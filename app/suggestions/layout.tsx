'use client'

import type { ReactNode } from 'react'
import Navigation from '@/components/Navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'

export default function SuggestionsLayout({ children }: { children: ReactNode }) {
  const { user, isReady } = useRequireAuth()

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
          <p className="text-on-surface-variant">Loading suggestions...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="ml-64 px-gutter pb-10 pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
