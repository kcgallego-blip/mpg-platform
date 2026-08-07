'use client'

import { useEffect, useRef } from 'react'
import {
  AUTH_SYNC_STORAGE_KEY,
  parseAuthSyncEvent,
  useAuthStore,
} from '@/lib/authStore'

const ACTIVITY_REFRESH_INTERVAL_MS = 60 * 1000

export default function AuthSessionManager() {
  const user = useAuthStore((state) => state.user)
  const initializeSession = useAuthStore((state) => state.initializeSession)
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const applyRemoteLogout = useAuthStore((state) => state.applyRemoteLogout)
  const lastRefreshAttempt = useRef(0)
  const refreshInFlight = useRef(false)

  useEffect(() => {
    void initializeSession()
  }, [initializeSession])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SYNC_STORAGE_KEY) return

      const authEvent = parseAuthSyncEvent(event.newValue)
      if (!authEvent) return

      if (authEvent.type === 'logout') {
        applyRemoteLogout()
        return
      }

      void initializeSession(true)
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [applyRemoteLogout, initializeSession])

  useEffect(() => {
    if (!user) return

    // Login/initialization just renewed the cookie. Throttling avoids a
    // request for every mouse or keyboard event.
    lastRefreshAttempt.current = Date.now()

    const renewAfterActivity = () => {
      const now = Date.now()

      if (
        refreshInFlight.current ||
        now - lastRefreshAttempt.current < ACTIVITY_REFRESH_INTERVAL_MS
      ) {
        return
      }

      lastRefreshAttempt.current = now
      refreshInFlight.current = true
      void refreshSession().finally(() => {
        refreshInFlight.current = false
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        renewAfterActivity()
      }
    }

    window.addEventListener('focus', renewAfterActivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('pointerdown', renewAfterActivity, { passive: true })
    document.addEventListener('keydown', renewAfterActivity)
    document.addEventListener('touchstart', renewAfterActivity, { passive: true })

    return () => {
      window.removeEventListener('focus', renewAfterActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('pointerdown', renewAfterActivity)
      document.removeEventListener('keydown', renewAfterActivity)
      document.removeEventListener('touchstart', renewAfterActivity)
    }
  }, [refreshSession, user])

  return null
}
