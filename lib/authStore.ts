import { create } from 'zustand'

export const AUTH_SYNC_STORAGE_KEY = 'mpg_auth_sync'

const LEGACY_SESSION_STORAGE_KEY = 'mpg_auth_session'
const LEGACY_AUTH_STORAGE_KEY = 'mpg_auth_user'

type AuthSyncEvent = {
  type: 'login' | 'logout'
  timestamp: number
  nonce: string
}

export interface User {
  email: string
  name: string
  avatar_image?: string | null
  role: string | null
  user_metadata?: {
    name?: string
    company?: string | null
    avatar_image?: string | null
  }
}

interface AuthStore {
  user: User | null
  initialized: boolean
  loading: boolean
  error: string | null
  initializeSession: (force?: boolean) => Promise<User | null>
  refreshSession: () => Promise<boolean>
  loginWithEmail: (email: string, password: string) => Promise<void>
  loginWithWebex: () => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  applyRemoteLogout: () => void
}

let initializationPromise: Promise<User | null> | null = null

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') return

  try {
    sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY)
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
  } catch {
    // HttpOnly cookies remain the authoritative session when storage is blocked.
  }
}

function broadcastAuthChange(type: AuthSyncEvent['type']) {
  if (typeof window === 'undefined') return

  try {
    const event: AuthSyncEvent = {
      type,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).slice(2),
    }

    localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(event))
  } catch {
    // Other tabs will still validate the shared cookies when they are opened.
  }
}

export function parseAuthSyncEvent(value: string | null): AuthSyncEvent | null {
  if (!value) return null

  try {
    const event = JSON.parse(value) as Partial<AuthSyncEvent>

    if (
      (event.type === 'login' || event.type === 'logout') &&
      typeof event.timestamp === 'number' &&
      typeof event.nonce === 'string'
    ) {
      return event as AuthSyncEvent
    }
  } catch {
    // Ignore malformed or unrelated browser storage values.
  }

  return null
}

function toUser(userData: Record<string, unknown>): User {
  if (typeof userData.email !== 'string') {
    throw new Error('Invalid authenticated user')
  }

  return {
    email: userData.email,
    name: typeof userData.name === 'string' ? userData.name : '',
    avatar_image: typeof userData.avatar_image === 'string' ? userData.avatar_image : null,
    role: typeof userData.role === 'string' ? userData.role : null,
    user_metadata: {
      name: typeof userData.name === 'string' ? userData.name : '',
      company: typeof userData.company === 'string' ? userData.company : null,
      avatar_image: typeof userData.avatar_image === 'string' ? userData.avatar_image : null,
    },
  }
}

async function fetchCurrentUser(): Promise<User | null> {
  const response = await fetch('/api/auth/me', {
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to verify your session')
  }

  const userData = await response.json() as Record<string, unknown>
  return toUser(userData)
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  initialized: false,
  loading: false,
  error: null,

  initializeSession: async (force = false) => {
    if (get().initialized && !force) {
      return get().user
    }

    if (initializationPromise) {
      return initializationPromise
    }

    clearLegacyAuthStorage()
    set({ loading: true, error: null })

    initializationPromise = (async () => {
      try {
        const user = await fetchCurrentUser()
        set({ user, initialized: true, loading: false, error: null })
        return user
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to verify your session'
        set({ initialized: true, loading: false, error: message })
        return get().user
      } finally {
        initializationPromise = null
      }
    })()

    return initializationPromise
  },

  refreshSession: async () => {
    try {
      const user = await fetchCurrentUser()

      if (!user) {
        set({ user: null, initialized: true, error: null })
        broadcastAuthChange('logout')
        return false
      }

      set({ user, initialized: true, error: null })
      return true
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to refresh your session'
      // A temporary network failure must not behave like an explicit logout.
      set({ error: message })
      return false
    }
  },

  register: async (email, name, password) => {
    try {
      set({ loading: true, error: null })

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to register')
      }

      set({ user: null, initialized: true, loading: false })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to register'
      set({ error: message, loading: false })
      throw error
    }
  },

  loginWithEmail: async (email, password) => {
    try {
      set({ loading: true, error: null })

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to login')
      }

      const userData = await response.json() as Record<string, unknown>
      const user = toUser(userData)

      set({ user, initialized: true, loading: false })
      clearLegacyAuthStorage()
      broadcastAuthChange('login')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to login'
      set({ error: message, loading: false })
      throw error
    }
  },

  loginWithWebex: async () => {
    try {
      set({ loading: true, error: null })

      const clientId = process.env.NEXT_PUBLIC_WEBEX_CLIENT_ID
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')
      const redirectUri = `${baseUrl}/api/auth/callback`
      const scopes = encodeURIComponent('spark:people_read spark:people_write')
      const state = Math.random().toString(36).substring(7)

      localStorage.setItem('webex_oauth_state', state)

      const authUrl = `https://webexapis.com/v1/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}`

      window.location.href = authUrl
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to connect with Webex'
      set({ error: message, loading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      set({ loading: true, error: null })

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error('Failed to logout')
      }

      localStorage.removeItem('webex_oauth_state')
      clearLegacyAuthStorage()
      set({ user: null, initialized: true, loading: false })
      broadcastAuthChange('logout')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to logout'
      set({ error: message, loading: false })
      throw error
    }
  },

  applyRemoteLogout: () => {
    clearLegacyAuthStorage()
    set({ user: null, initialized: true, loading: false, error: null })
  },
}))
