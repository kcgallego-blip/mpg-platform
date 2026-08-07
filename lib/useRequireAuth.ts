'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from './authStore'

/** Validates the shared HttpOnly-cookie session before rendering protected UI. */
export function useRequireAuth() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const initializeSession = useAuthStore((state) => state.initializeSession)

  useEffect(() => {
    if (!initialized) {
      void initializeSession()
    }
  }, [initialized, initializeSession])

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/login')
    }
  }, [initialized, router, user])

  return {
    user,
    isReady: initialized && Boolean(user),
  }
}
