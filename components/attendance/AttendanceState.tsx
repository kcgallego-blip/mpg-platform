import { AlertCircle, CalendarX2, LoaderCircle } from 'lucide-react'

type AttendanceStateProps = {
  kind: 'loading' | 'empty' | 'error'
  title: string
  description: string
  onRetry?: () => void
}

export default function AttendanceState({
  kind,
  title,
  description,
  onRetry,
}: AttendanceStateProps) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? AlertCircle : CalendarX2

  return (
    <div
      className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-outline-variant/30 bg-white/70 px-6 py-12 text-center"
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon
        size={30}
        className={`mb-3 ${kind === 'loading' ? 'animate-spin text-primary' : kind === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
      />
      <h2 className="font-hanken text-lg font-semibold text-on-surface">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-on-surface-variant">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  )
}
