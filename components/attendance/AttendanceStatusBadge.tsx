import type { AttendanceDayStatus, ResolvedAttendanceDay } from '@/lib/attendance'

export const attendanceStatusTone = (status: AttendanceDayStatus) => {
  if (status.startsWith('RDOT')) return 'bg-[#34A853]/20 text-[#176B35] ring-[#34A853]/35 dark:bg-[#34A853]/30 dark:text-[#9BE7AE]'
  if (status === 'Complete') return 'bg-success-container text-on-success-container ring-success/25'
  if (status === 'Currently Working') return 'bg-info-container text-on-info-container ring-info/25'
  if (status === 'Awaiting Time In') return 'bg-[#FFFF00]/35 text-[#514A00] ring-[#D8C900]/40 dark:bg-[#FFFF00]/20 dark:text-[#FFF59D]'
  if (status === 'Scheduled') return 'bg-primary-container/45 text-on-primary-container ring-primary/20'
  if (status === 'Vacation Leave' || status === 'Leave') return 'bg-info-container text-on-info-container ring-info/25'
  if (status === 'Sick Leave') return 'bg-warning-container text-on-warning-container ring-warning/30'
  if (status === 'Day Off' || status === 'Holiday Off' || status === 'Transition Off') {
    return 'bg-surface-container-high text-on-surface-variant ring-outline-variant/40'
  }
  if (status === 'Not Absent - Missing Attendance') return 'bg-warning-container text-on-warning-container ring-warning/30'
  if (status === 'Absent' || status === 'Absence Confirmation Required' || status.startsWith('Missing') || status === 'No attendance record') {
    return 'bg-error-container text-on-error-container ring-error/30'
  }
  return 'bg-surface-container-high text-on-surface ring-outline-variant/40'
}

export const attendanceReviewPriority = (day: ResolvedAttendanceDay) => {
  const status = day.status
  if (status === 'Absence Confirmation Required' || status === 'Absent' || status.startsWith('Missing') || status === 'No attendance record') return 0
  if (day.preShiftOtReview === 'pending' || day.postShiftOtReview === 'pending') return 1
  if (status === 'Awaiting Time In') return 2
  if (status === 'Not Absent - Missing Attendance') return 3
  if (status === 'Currently Working' || status === 'Scheduled') return 4
  if (status.startsWith('RDOT')) return status.includes('Missing') ? 0 : status.includes('Currently') ? 4 : 5
  if (status === 'Complete') return 5
  return 6
}

export default function AttendanceStatusBadge({ status }: { status: AttendanceDayStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${attendanceStatusTone(status)}`}>{status}</span>
}
