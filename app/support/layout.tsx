'use client'

import type { ReactNode } from 'react'
import Navigation from '@/components/Navigation'
import { useRequireAuth } from '@/lib/useRequireAuth'

export default function SupportLayout({ children }: { children: ReactNode }) {
  const { user, isReady } = useRequireAuth()
  if (!isReady) return <div className="flex min-h-screen items-center justify-center" role="status"><div className="h-12 w-12 animate-spin rounded-full border-4 border-outline-variant border-t-primary-container" /></div>
  if (!user) return null
  return <div className="min-h-screen"><Navigation /><main className="ml-64 px-gutter pb-10"><div className="mx-auto max-w-[1440px]">{children}</div></main></div>
}
