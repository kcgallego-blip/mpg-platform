import type { AttendanceNetworkStatus, ResolvedAttendanceDay } from './attendance.ts'
import { addDateKeyDays } from './attendance.ts'

export type ClockAction = 'time_in' | 'time_out'
export type ClockSurface = 'attendance' | 'home'

export const getSelfServiceOtReview = (minutes: number, isRdot: boolean) =>
  !isRdot && minutes >= 120 ? 'pending' as const : 'not_required' as const

export type AgentClockState = {
  enabled: boolean
  serverTimestamp: string
  shiftDate: string | null
  status: string
  shiftGroup: 'normal_graveyard' | 'overnight' | null
  startShift: string
  endShift: string
  timeIn: string | null
  timeOut: string | null
  isRdot: boolean
  action: ClockAction | null
  actionLabel: string | null
  blockedReason: string | null
  networkStatus: AttendanceNetworkStatus | null
  preShiftOtReview: string
  postShiftOtReview: string
  preShiftOtMinutes: number
  postShiftOtMinutes: number
  lateMinutes: number
  undertimeMinutes: number
}

const clockMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59) return null
  const suffix = match[3]?.toLowerCase()
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    hour = suffix === 'am' ? hour % 12 : (hour % 12) + 12
  } else if (hour > 23) return null
  return hour * 60 + minute
}

const timestampValue = (value: string | null) => value ? Date.parse(`${value.replace(' ', 'T')}Z`) : Number.NaN
const protectedStatus = (status: string) => ['Holiday Off', 'Vacation Leave', 'Sick Leave', 'Leave', 'Transition Off'].includes(status)

export const chooseCurrentClockDay = (days: ResolvedAttendanceDay[], easternTimestamp: string) => {
  const today = easternTimestamp.slice(0, 10)
  const yesterday = addDateKeyDays(today, -1)
  const now = timestampValue(easternTimestamp)
  const todayDay = days.find((day) => day.shiftDate === today)
  const yesterdayDay = days.find((day) => day.shiftDate === yesterday)
  const open = [...days].filter((day) => day.timeIn && !day.timeOut).sort((a, b) => b.shiftDate.localeCompare(a.shiftDate))[0]

  if (open) {
    const openedAt = timestampValue(open.timeIn)
    const notExpired = Number.isFinite(openedAt) && now < openedAt + 24 * 60 * 60_000
    const todayHasScheduledShift = Boolean(todayDay && todayDay.status !== 'Day Off' && !todayDay.status.startsWith('RDOT') && !protectedStatus(todayDay.status))
    const nextStartMinutes = todayHasScheduledShift && todayDay ? clockMinutes(todayDay.startShift) : null
    const nextStart = nextStartMinutes === null ? Number.POSITIVE_INFINITY : Date.parse(`${today}T00:00:00Z`) + nextStartMinutes * 60_000
    if (notExpired && (open.shiftDate === today || now < nextStart)) return { day: open, staleOpen: false }
    return { day: open, staleOpen: true }
  }

  if (yesterdayDay?.shiftGroup === 'normal_graveyard') {
    const start = clockMinutes(yesterdayDay.startShift)
    const end = clockMinutes(yesterdayDay.endShift)
    const currentMinutes = clockMinutes(easternTimestamp.slice(11, 16))
    if (start !== null && end !== null && currentMinutes !== null && end <= start && currentMinutes <= end) {
      return { day: yesterdayDay, staleOpen: false }
    }
  }
  return { day: todayDay || null, staleOpen: false }
}

export const getClockActionState = (day: ResolvedAttendanceDay | null, staleOpen = false) => {
  if (!day) return { action: null, actionLabel: null, blockedReason: 'No current schedule could be resolved.' }
  if (staleOpen) return { action: null, actionLabel: null, blockedReason: 'An earlier unfinished shift requires manager correction.' }
  if (protectedStatus(day.status)) return { action: null, actionLabel: null, blockedReason: `${day.status} does not allow self-service clocking.` }
  if (!day.timeIn && day.timeOut) return { action: null, actionLabel: null, blockedReason: 'Time Out exists without Time In. Ask your Team Leader to correct it.' }
  const isRdot = day.status === 'Day Off' || day.status.startsWith('RDOT')
  if (!day.timeIn) return { action: 'time_in' as const, actionLabel: isRdot ? 'RDOT In' : 'Time In', blockedReason: null }
  if (!day.timeOut) return { action: 'time_out' as const, actionLabel: isRdot ? 'RDOT Out' : 'Time Out', blockedReason: null }
  return { action: null, actionLabel: null, blockedReason: null }
}
