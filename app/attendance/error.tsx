'use client'

import { AlertCircle } from 'lucide-react'

export default function AttendanceError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-error/20 bg-error/5 p-8 text-center" role="alert">
        <AlertCircle size={34} className="mx-auto mb-3 text-error" />
        <h1 className="font-hanken text-xl font-bold text-on-surface">Attendance page unavailable</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Something went wrong while rendering this page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
