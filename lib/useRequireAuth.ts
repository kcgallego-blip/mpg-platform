'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from './authStore'

/**
 * Hydrates the session snapshot once and performs a synchronous client guard.
 * Server APIs remain responsible for authoritative authorization.
 */
export function useRequireAuth() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const rehydrateFromStorage = useAuthStore((state) => state.rehydrateFromStorage)

  useEffect(() => {
    if (!initialized) {
      rehydrateFromStorage()
    }
  }, [initialized, rehydrateFromStorage])

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
