export type ThemePreference = 'light' | 'dark'

export const THEME_PREFERENCES_STORAGE_KEY = 'mpg_theme_preferences'
export const ACTIVE_THEME_STORAGE_KEY = 'mpg_active_theme'

export type ThemePreferences = Record<string, ThemePreference>

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark'
}

export function normalizeThemeUserKey(email: string) {
  return email.trim().toLowerCase()
}

export function parseThemePreferences(value: string | null): ThemePreferences {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, ThemePreference] =>
        Boolean(entry[0]) && isThemePreference(entry[1])
      )
    )
  } catch {
    return {}
  }
}

export function getUserThemePreference(
  preferences: ThemePreferences,
  email: string | null | undefined,
) {
  if (!email) return null
  return preferences[normalizeThemeUserKey(email)] ?? null
}

export function withUserThemePreference(
  preferences: ThemePreferences,
  email: string,
  theme: ThemePreference,
): ThemePreferences {
  return {
    ...preferences,
    [normalizeThemeUserKey(email)]: theme,
  }
}

export function resolveTheme(
  preference: ThemePreference | null | undefined,
  systemPrefersDark: boolean,
): ThemePreference {
  return preference ?? (systemPrefersDark ? 'dark' : 'light')
}
