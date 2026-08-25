'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuthStore } from '@/lib/authStore'
import {
  ACTIVE_THEME_STORAGE_KEY,
  THEME_PREFERENCES_STORAGE_KEY,
  getUserThemePreference,
  isThemePreference,
  parseThemePreferences,
  resolveTheme,
  withUserThemePreference,
  type ThemePreference,
} from '@/lib/theme'

type ThemeContextValue = {
  theme: ThemePreference
  hasSavedPreference: boolean
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_TRANSITION_MS = 250

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function themeFromDocument(): ThemePreference {
  const theme = document.documentElement.dataset.theme
  return isThemePreference(theme) ? theme : resolveTheme(null, systemPrefersDark())
}

function applyDocumentTheme(theme: ThemePreference, animate = false) {
  const root = document.documentElement

  if (animate) {
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), THEME_TRANSITION_MS)
  }

  root.dataset.theme = theme
  root.style.colorScheme = theme
}

function readPreferences() {
  try {
    return parseThemePreferences(localStorage.getItem(THEME_PREFERENCES_STORAGE_KEY))
  } catch {
    return {}
  }
}

function cacheActiveTheme(theme: ThemePreference | null) {
  try {
    if (theme) {
      localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, theme)
    } else {
      localStorage.removeItem(ACTIVE_THEME_STORAGE_KEY)
    }
  } catch {
    // The in-memory theme still works when browser storage is unavailable.
  }
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const [theme, setResolvedTheme] = useState<ThemePreference>(() =>
    typeof document === 'undefined' ? 'light' : themeFromDocument()
  )
  const [hasSavedPreference, setHasSavedPreference] = useState(false)

  const applyForCurrentUser = useCallback((animate = false) => {
    if (!initialized) return

    const preference = getUserThemePreference(readPreferences(), user?.email)
    const resolved = resolveTheme(preference, systemPrefersDark())

    setHasSavedPreference(Boolean(preference))
    setResolvedTheme(resolved)
    applyDocumentTheme(resolved, animate)
    cacheActiveTheme(user ? resolved : null)
  }, [initialized, user])

  useEffect(() => {
    applyForCurrentUser()
  }, [applyForCurrentUser])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      const preference = getUserThemePreference(readPreferences(), user?.email)
      if (!user || !preference) applyForCurrentUser()
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [applyForCurrentUser, user])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_PREFERENCES_STORAGE_KEY) {
        applyForCurrentUser(true)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [applyForCurrentUser])

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    if (!user?.email) return

    const preferences = withUserThemePreference(readPreferences(), user.email, nextTheme)

    try {
      localStorage.setItem(THEME_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Keep the choice active for this page even if persistence is blocked.
    }

    setHasSavedPreference(true)
    setResolvedTheme(nextTheme)
    applyDocumentTheme(nextTheme, true)
    cacheActiveTheme(nextTheme)
  }, [user?.email])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  const value = useMemo(
    () => ({ theme, hasSavedPreference, setTheme, toggleTheme }),
    [hasSavedPreference, setTheme, theme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
