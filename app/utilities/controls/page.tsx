'use client'

import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, SlidersHorizontal } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { useFeatureSettingsStore } from '@/lib/featureSettingsStore'

export default function ControlsPage() {
  const user = useAuthStore((state) => state.user)
  const attendanceRouteEnabled = useFeatureSettingsStore(
    (state) => state.attendanceRouteEnabled
  )
  const loadedFor = useFeatureSettingsStore((state) => state.loadedFor)
  const loading = useFeatureSettingsStore((state) => state.loading)
  const saving = useFeatureSettingsStore((state) => state.saving)
  const error = useFeatureSettingsStore((state) => state.error)
  const loadFeatureSettings = useFeatureSettingsStore((state) => state.load)
  const updateAttendanceRoute = useFeatureSettingsStore(
    (state) => state.updateAttendanceRoute
  )

  useEffect(() => {
    if (user?.email) {
      void loadFeatureSettings(user.email)
    }
  }, [loadFeatureSettings, user?.email])

  const isReady = loadedFor === user?.email

  const handleToggle = async () => {
    if (!user?.email || saving) return

    try {
      await updateAttendanceRoute(user.email, !attendanceRouteEnabled)
    } catch {
      // The store exposes the API error beside the switch.
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <SlidersHorizontal size={24} />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
              Utilities
            </p>
            <h1 className="font-hanken text-display-lg font-bold text-on-surface">
              Controls
            </h1>
          </div>
        </div>
        <p className="max-w-2xl text-on-surface-variant">
          Manage application-wide behavior. Changes take effect for users when
          feature settings are refreshed.
        </p>
      </div>

      <section
        aria-labelledby="feature-toggles-heading"
        className="overflow-hidden rounded-2xl border border-outline/20 bg-white/80 shadow-sm backdrop-blur-sm"
      >
        <div className="border-b border-outline/15 bg-surface-container-low/60 px-6 py-5">
          <h2
            id="feature-toggles-heading"
            className="font-hanken text-xl font-bold text-on-surface"
          >
            Feature Toggles
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Control which optional routes are available outside the Admin role.
          </p>
        </div>

        <div className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <h3 className="font-semibold text-on-surface">
              Enable Public Attendance Route
            </h3>
            <p id="attendance-toggle-description" className="mt-1 text-sm text-on-surface-variant">
              When enabled, Attendance appears in navigation and can be opened by
              every assigned role. Admins always retain access.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isReady && attendanceRouteEnabled}
            aria-describedby="attendance-toggle-description"
            aria-label="Enable Public Attendance Route"
            disabled={!isReady || loading || saving}
            onClick={() => void handleToggle()}
            className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isReady && attendanceRouteEnabled ? 'bg-primary' : 'bg-outline-variant'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                isReady && attendanceRouteEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-outline/15 px-6 py-4">
          {error ? (
            <p className="flex items-center gap-2 text-sm text-error" role="alert">
              <AlertCircle size={17} />
              {error}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-on-surface-variant" role="status">
              <CheckCircle2 size={17} className="text-primary" />
              {saving
                ? 'Saving change...'
                : loading || !isReady
                  ? 'Loading current setting...'
                  : attendanceRouteEnabled
                    ? 'Attendance is available to all assigned roles.'
                    : 'Attendance is available to Admins only.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
