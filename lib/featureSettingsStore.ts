import { create } from 'zustand'

type AttendanceRouteSettingsResponse = {
  attendanceRouteEnabled: boolean
  canAccessAttendance: boolean
  isAdmin: boolean
}

type ProductivityReportSettingsResponse = {
  productivityReportEnabled: boolean
}

type FeatureSettingsResponse = AttendanceRouteSettingsResponse &
  ProductivityReportSettingsResponse

type FeatureSettingsStore = FeatureSettingsResponse & {
  loadedFor: string | null
  loading: boolean
  saving: boolean
  error: string | null
  load: (email: string, force?: boolean) => Promise<void>
  updateAttendanceRoute: (email: string, enabled: boolean) => Promise<void>
  updateProductivityReport: (email: string, enabled: boolean) => Promise<void>
}

let pendingLoad: Promise<void> | null = null
let pendingEmail: string | null = null

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load feature settings')
  }

  return payload as T
}

export const useFeatureSettingsStore = create<FeatureSettingsStore>((set, get) => ({
  attendanceRouteEnabled: false,
  canAccessAttendance: false,
  productivityReportEnabled: false,
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
            productivityReportEnabled: false,
            isAdmin: false,
            loadedFor: null,
          }),
    })

    pendingEmail = email
    pendingLoad = (async () => {
      try {
        const [attendanceResponse, productivityReportResponse] = await Promise.all([
          fetch('/api/settings/attendance-route', { cache: 'no-store' }),
          fetch('/api/settings/productivity-report', { cache: 'no-store' }),
        ])
        const [attendanceSettings, productivityReportSettings] = await Promise.all([
          readResponse<AttendanceRouteSettingsResponse>(attendanceResponse),
          readResponse<ProductivityReportSettingsResponse>(productivityReportResponse),
        ])

        set({
          ...attendanceSettings,
          ...productivityReportSettings,
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
      const settings = await readResponse<AttendanceRouteSettingsResponse>(response)

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

  updateProductivityReport: async (email, enabled) => {
    set({ saving: true, error: null })

    try {
      const response = await fetch('/api/settings/productivity-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const settings = await readResponse<ProductivityReportSettingsResponse>(response)

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
