export default function AttendanceLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
        <p className="text-sm text-on-surface-variant">Loading attendance...</p>
      </div>
    </div>
  )
}
