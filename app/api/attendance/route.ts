import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { buildTrackerColumn } from '@/lib/attendanceManagement'
import {
  AttendanceConfigurationError,
  loadAttendanceRoster,
  loadClockNetworkStatuses,
  loadOperationalAttendance,
  loadResolvedAttendance,
  loadTrackerOrder,
} from '@/lib/attendanceService'
import { getDefaultShiftDate, getOperationalCalendarDate, isDateKey, normalizeEmail } from '@/lib/attendance'
import { canUserAccessAttendance } from '@/lib/featureSettings'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const MAX_AGENT_RANGE_DAYS = 62
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

const getRangeLength = (from: string, to: string) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

const getValidCalendarRange = (searchParams: URLSearchParams) => {
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  if (!isDateKey(from) || !isDateKey(to)) return null
  const rangeLength = getRangeLength(from, to)
  return rangeLength >= 1 && rangeLength <= MAX_AGENT_RANGE_DAYS ? { from, to } : null
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE })
    if (!(await canUserAccessAttendance(user.role, user.email))) {
      return NextResponse.json({ error: 'Attendance route is disabled' }, { status: 403, headers: NO_STORE })
    }

    const roster = await loadAttendanceRoster()
    const currentShiftDate = getDefaultShiftDate()
    const { searchParams } = request.nextUrl

    if (user.role?.trim().toLowerCase() === 'agent') {
      const range = getValidCalendarRange(searchParams)
      if (!range) {
        return NextResponse.json({ error: 'A valid attendance month range is required' }, { status: 400, headers: NO_STORE })
      }
      const agent = roster.find((entry) => entry.email === normalizeEmail(user.email))
      if (!agent) return NextResponse.json({ error: 'Your account is not linked to an active roster email.' }, { status: 409, headers: NO_STORE })
      const resolved = await loadResolvedAttendance({ ...range, roster: [agent], currentShiftDate })
      const currentScheduleDay = resolved.days.find((day) => day.shiftDate === currentShiftDate)
      const currentCalendarDate = currentScheduleDay
        ? getOperationalCalendarDate(currentShiftDate, currentScheduleDay.shiftGroup)
        : null
      return NextResponse.json({ records: resolved.attendance, days: resolved.days, currentCalendarDate, scope: 'personal' }, { headers: NO_STORE })
    }

    if (!canManageAttendance(user.role)) {
      return NextResponse.json({ error: 'Attendance management access denied' }, { status: 403, headers: NO_STORE })
    }

    const requestedAgentEmail = normalizeEmail(searchParams.get('agentEmail') || '')
    if (requestedAgentEmail) {
      const range = getValidCalendarRange(searchParams)
      if (!range) return NextResponse.json({ error: 'A valid attendance month range is required' }, { status: 400, headers: NO_STORE })
      const selectedAgent = roster.find((entry) => entry.email === requestedAgentEmail)
      if (!selectedAgent) return NextResponse.json({ error: 'The selected agent is not in the active roster.' }, { status: 404, headers: NO_STORE })
      const resolved = await loadResolvedAttendance({ ...range, roster: [selectedAgent], currentShiftDate })
      const currentScheduleDay = resolved.days.find((day) => day.shiftDate === currentShiftDate)
      const currentCalendarDate = currentScheduleDay
        ? getOperationalCalendarDate(currentShiftDate, currentScheduleDay.shiftGroup)
        : null
      return NextResponse.json({
        records: resolved.attendance,
        days: resolved.days,
        currentCalendarDate,
        scope: 'management_personal',
        selectedAgent: { email: selectedAgent.email, name: selectedAgent.name },
      }, { headers: NO_STORE })
    }

    const shiftDate = searchParams.get('shiftDate') || currentShiftDate
    if (!isDateKey(shiftDate)) return NextResponse.json({ error: 'A valid shift date is required' }, { status: 400, headers: NO_STORE })
    const order = await loadTrackerOrder(roster)
    const displayRoster = order.ready ? order.agents : roster
    const resolved = await loadOperationalAttendance({ shiftDate, roster: displayRoster, currentShiftDate })
    const tracker = order.ready ? buildTrackerColumn(resolved.days) : null
    const clockNetworkStatuses = await loadClockNetworkStatuses(resolved.days)

    return NextResponse.json({
      records: resolved.attendance,
      days: resolved.days,
      scope: 'management',
      tracker,
      order: { ready: order.ready, issues: order.issues },
      roster: displayRoster.map((agent) => ({ email: agent.email, name: agent.name })),
      clockNetworkStatuses,
    }, { headers: NO_STORE })
  } catch (error) {
    console.error('Error loading attendance:', error)
    const rawMessage = error instanceof Error ? error.message : 'Unable to load attendance'
    const missingOutcomeMigration = /attendance_day_outcomes/i.test(rawMessage)
    const missingClockMigration = /pre_shift_ot_review|post_shift_ot_review/i.test(rawMessage)
    const message = missingOutcomeMigration
      ? 'Apply migration 32_add_attendance_absence_outcomes.sql before loading attendance.'
      : missingClockMigration
        ? 'Apply migration 33_add_agent_self_service_clock.sql before loading attendance.'
      : rawMessage
    return NextResponse.json(
      { error: message },
      { status: error instanceof AttendanceConfigurationError || missingOutcomeMigration || missingClockMigration ? 409 : 500, headers: NO_STORE }
    )
  }
}
