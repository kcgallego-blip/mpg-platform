import { create } from 'zustand'

const AUTH_STORAGE_KEY = 'mpg_auth_user'

export interface User {
  email: string
  name: string
  avatar_image?: string
  role?: string
  user_metadata?: {
    name?: string
    company?: string
    avatar_image?: string
  }
}

interface AuthStore {
  user: User | null
  loading: boolean
  error: string | null
  loginWithEmail: (email: string, password: string) => Promise<void>
  loginWithWebex: () => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  rehydrateFromStorage: () => void
}

const persistUserToStorage = (user: User | null) => {
  if (typeof window === 'undefined') return

  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }
}

const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return null

    const storedUser = JSON.parse(stored) as User

    return {
      email: storedUser.email,
      name: storedUser.name,
      avatar_image: storedUser.avatar_image,
      role: storedUser.role,
      user_metadata: storedUser.user_metadata,
    }
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  error: null,

  rehydrateFromStorage: () => {
    const storedUser = getUserFromStorage()
    if (storedUser) {
      set({ user: storedUser })
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

      set({ user: null, loading: false })

      persistUserToStorage(null)
    } catch (error: any) {
      set({ error: error.message, loading: false })
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

      const userData = await response.json()
      const user = {
        email: userData.email,
        name: userData.name,
        avatar_image: userData.avatar_image,
        role: userData.role,
      }

      set({ user, loading: false })

      persistUserToStorage(user)
    } catch (error: any) {
      set({ error: error.message, loading: false })
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
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      set({ loading: true, error: null })

      await fetch('/api/auth/logout', { method: 'POST' })

      localStorage.removeItem('webex_oauth_state')
      persistUserToStorage(null)

      set({ user: null, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  checkAuth: async () => {
    try {
      set({ loading: true })

      const response = await fetch('/api/auth/me', { cache: 'no-store' })

      if (response.ok) {
        const userData = await response.json()
        const user = {
          email: userData.email,
          name: userData.name,
          avatar_image: userData.avatar_image,
          role: userData.role,
          user_metadata: {
            name: userData.name,
            company: userData.company,
            avatar_image: userData.avatar_image,
          },
        }

        set({ user, loading: false })

        persistUserToStorage(user)
      } else {
        set({ user: null, loading: false })
        persistUserToStorage(null)
      }
    } catch (error: any) {
      set({ user: null, loading: false, error: error.message })
      persistUserToStorage(null)
    }
  },
}))
