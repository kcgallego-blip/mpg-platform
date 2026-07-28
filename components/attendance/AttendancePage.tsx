'use client'

import { ShieldX } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { getDefaultShiftDate } from '@/lib/attendance'
import AgentCalendarView from './AgentCalendarView'
import TeamAttendanceListView from './TeamAttendanceListView'

export default function AttendancePage() {
  const user = useAuthStore((state) => state.user)
  const currentShiftDate = getDefaultShiftDate()

  if (user?.role === 'Agent') {
    return <AgentCalendarView currentShiftDate={currentShiftDate} />
  }

  if (user?.role) {
    return <TeamAttendanceListView currentShiftDate={currentShiftDate} />
  }

  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-error/20 bg-white/80 p-8 text-center shadow-sm">
        <ShieldX size={36} className="mx-auto mb-4 text-error" />
        <h1 className="font-hanken text-2xl font-bold text-on-surface">Attendance access restricted</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Attendance is available after an administrator assigns your account a role.
        </p>
      </div>
    </div>
  )
}
