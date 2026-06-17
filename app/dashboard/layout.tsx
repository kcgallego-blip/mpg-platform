'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import Navigation from '@/components/Navigation'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, loading, checkAuth, rehydrateFromStorage } = useAuthStore()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      rehydrateFromStorage()
      await checkAuth()
      setIsCheckingAuth(false)
    }

    initAuth()
  }, [checkAuth, rehydrateFromStorage])

  useEffect(() => {
    if (!isCheckingAuth && !user) {
      router.push('/login')
    }
  }, [user, isCheckingAuth, router])

  if (isCheckingAuth || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-outline-variant/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-on-surface-variant">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!user.role) {
    return (
      <div className="min-h-screen relative">
        <Navigation />
        <main className="ml-64 pt-8 px-gutter max-w-container flex items-center justify-center">
          <div className="text-center max-w-md">
            <h1 className="font-hanken text-headline-lg font-bold text-on-surface mb-4">
              Account Pending
            </h1>
            <p className="text-on-surface-variant">
              Your account is in pending status. Please contact the administrator for assistance.
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/20 to-white" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-container/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-inverse-primary/5 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>
      <div className="relative z-10">
        <Navigation />
        <div className="relative z-10">
          <main className="ml-64 pt-8 px-gutter max-w-container">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
