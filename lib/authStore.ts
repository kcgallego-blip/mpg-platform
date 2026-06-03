import { create } from 'zustand'
import { supabase } from './supabase'

const AUTH_STORAGE_KEY = 'mpg_auth_user'

export interface User {
  email: string
  name: string
  avatar_image?: string
  role?: string
  token?: string
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
  loginWithWebex: () => Promise<void>
  register: (email: string) => Promise<void>
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
    return stored ? JSON.parse(stored) : null
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

  register: async (email: string) => {
    try {
      set({ loading: true, error: null })

      // Create user via API
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to register')
      }

      const userData = await response.json()
      const user = {
        email: userData.email,
        name: userData.name,
        avatar_image: userData.avatar_image,
        role: userData.role,
        token: userData.token,
      }

      set({
        user,
        loading: false,
      })
      
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
      // Use window.location.origin as fallback for Vercel deployment
      // Remove trailing slash from base URL to avoid double slashes
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

      // Clear auth cookie via API
      await fetch('/api/auth/logout', { method: 'POST' })

      // Clear localStorage
      localStorage.removeItem('webex_oauth_state')
      persistUserToStorage(null)

      set({
        user: null,
        loading: false,
      })
    } catch (error: any) {
      set({ error: error.message, loading: false })
      throw error
    }
  },

  checkAuth: async () => {
    try {
      set({ loading: true })

      // Get user from auth cookie
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        const userData = await response.json()
        const user = {
          email: userData.email,
          name: userData.name,
          avatar_image: userData.avatar_image,
          role: userData.role,
          token: userData.token,
          user_metadata: {
            name: userData.name,
            company: userData.company,
            avatar_image: userData.avatar_image,
          },
        }
        
        set({
          user,
          loading: false,
        })
        
        persistUserToStorage(user)
      } else {
        set({ user: null, loading: false })
        persistUserToStorage(null)
      }
    } catch (error: any) {
      // Don't set error for 401 (not logged in)
      set({ user: null, loading: false })
      persistUserToStorage(null)
    }
  },
}))
