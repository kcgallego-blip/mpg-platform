import { create } from 'zustand'

const AUTH_STORAGE_KEY = 'mpg_auth_session'
const LEGACY_AUTH_STORAGE_KEY = 'mpg_auth_user'

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
  loginWithEmail: (email: string, password: string) => Promise<void>
  loginWithWebex: () => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  completeExternalLogin: () => Promise<void>
  rehydrateFromStorage: () => User | null
}

function isStoredUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false

  const user = value as Partial<User>

  return (
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    (user.role === null || typeof user.role === 'string')
  )
}

const persistUserToStorage = (user: User | null) => {
  if (typeof window === 'undefined') return

  try {
    // RBAC state is scoped to the active browser tab/session and is always
    // cleared on logout. Authentication remains in HttpOnly cookies.
    if (user) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    } else {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
    }

    // Do not carry the old, persistent RBAC snapshot into a new session.
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
  } catch {
    // The in-memory session remains usable when browser storage is unavailable.
  }
}

const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null

  try {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return null

    const storedUser: unknown = JSON.parse(stored)

    if (!isStoredUser(storedUser)) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return storedUser
  } catch {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
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

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  initialized: false,
  loading: false,
  error: null,

  rehydrateFromStorage: () => {
    const storedUser = getUserFromStorage()
    set({ user: storedUser, initialized: true })
    return storedUser
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
      persistUserToStorage(null)
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
      persistUserToStorage(user)
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

      await fetch('/api/auth/logout', { method: 'POST' })

      localStorage.removeItem('webex_oauth_state')
      persistUserToStorage(null)

      set({ user: null, initialized: true, loading: false })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to logout'
      set({ error: message, loading: false })
      throw error
    }
  },

  // OAuth resolves RBAC in its server callback. This request only transfers
  // that already-signed session snapshot into client memory once.
  completeExternalLogin: async () => {
    try {
      set({ loading: true, error: null })

      const response = await fetch('/api/auth/me', { cache: 'no-store' })

      if (!response.ok) {
        throw new Error('Unable to complete login')
      }

      const userData = await response.json() as Record<string, unknown>
      const user = toUser(userData)

      set({ user, initialized: true, loading: false })
      persistUserToStorage(user)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to complete login'
      set({ user: null, initialized: true, loading: false, error: message })
      persistUserToStorage(null)
      throw error
    }
  },
}))
