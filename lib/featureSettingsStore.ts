import { create } from 'zustand'

type FeatureSettingsResponse = {
  attendanceRouteEnabled: boolean
  canAccessAttendance: boolean
  isAdmin: boolean
}

type FeatureSettingsStore = FeatureSettingsResponse & {
  loadedFor: string | null
  loading: boolean
  saving: boolean
  error: string | null
  load: (email: string, force?: boolean) => Promise<void>
  updateAttendanceRoute: (email: string, enabled: boolean) => Promise<void>
}

let pendingLoad: Promise<void> | null = null
let pendingEmail: string | null = null

async function readResponse(response: Response): Promise<FeatureSettingsResponse> {
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load feature settings')
  }

  return payload as FeatureSettingsResponse
}

export const useFeatureSettingsStore = create<FeatureSettingsStore>((set, get) => ({
  attendanceRouteEnabled: false,
  canAccessAttendance: false,
  isAdmin: false,
  loadedFor: null,
  loading: false,
  saving: false,
  error: null,

  load: async (email, force = false) => {
    const current = get()

    if (!force && current.loadedFor === email) {
      return
    }

    if (!force && pendingLoad && pendingEmail === email) {
      return pendingLoad
    }

    set({
      loading: true,
      error: null,
      ...(current.loadedFor === email
        ? {}
        : {
            attendanceRouteEnabled: false,
            canAccessAttendance: false,
            isAdmin: false,
            loadedFor: null,
          }),
    })

    pendingEmail = email
    pendingLoad = (async () => {
      try {
        const response = await fetch('/api/settings/attendance-route', {
          cache: 'no-store',
        })
        const settings = await readResponse(response)

        set({
          ...settings,
          loadedFor: email,
          loading: false,
          error: null,
        })
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load feature settings',
        })
      } finally {
        if (pendingEmail === email) {
          pendingEmail = null
          pendingLoad = null
        }
      }
    })()

    return pendingLoad
  },

  updateAttendanceRoute: async (email, enabled) => {
    set({ saving: true, error: null })

    try {
      const response = await fetch('/api/settings/attendance-route', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const settings = await readResponse(response)

      set({
        ...settings,
        loadedFor: email,
        saving: false,
        error: null,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update feature settings'
      set({ saving: false, error: message })
      throw error
    }
  },
}))
