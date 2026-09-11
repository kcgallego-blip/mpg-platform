import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { commitAttendanceRows, loadAttendanceRoster, loadOperationalAttendance, loadTrackerOrder } from '@/lib/attendanceService'
import { formatAttendanceTime, getDefaultShiftDate, isDateKey, normalizeEmail } from '@/lib/attendance'
import { getAttendanceTiming, OVERTIME_REVIEW_MINUTES } from '@/lib/attendanceManagement'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const normalizeClock = (value: unknown) => {
  const clock = typeof value === 'string' ? value.trim() : ''
  if (!clock) return null
  if (!CLOCK.test(clock)) throw new Error(`Invalid clock value: ${clock}. Use HH:mm or HH:mm:ss.`)
  return clock.length === 5 ? `${clock}:00` : clock
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS })
    if (!canManageAttendance(user.role)) return NextResponse.json({ error: 'Manual attendance access denied' }, { status: 403, headers: HEADERS })
    const body = await request.json()
    const shiftDate = typeof body?.shiftDate === 'string' ? body.shiftDate : ''
    if (!isDateKey(shiftDate)) return NextResponse.json({ error: 'A valid shift date is required.' }, { status: 400, headers: HEADERS })
    if (!Array.isArray(body?.rows) || !body.rows.length) return NextResponse.json({ error: 'Select at least one attendance row to save.' }, { status: 400, headers: HEADERS })

    const roster = await loadAttendanceRoster()
    const order = await loadTrackerOrder(roster)
    if (!order.ready) return NextResponse.json({ error: 'Save a valid tracker order before manual entry.', issues: order.issues }, { status: 409, headers: HEADERS })
    const resolved = await loadOperationalAttendance({ shiftDate, roster: order.agents, currentShiftDate: getDefaultShiftDate() })
    const dayByEmail = new Map(resolved.days.map((day) => [day.agent, day]))
    const rosterEmails = new Set(roster.map((agent) => agent.email))
    const protectedStatuses = new Set(['Holiday Off', 'Leave', 'Vacation Leave', 'Sick Leave', 'Transition Off'])

    const outcomes: Array<{ agent_email: string; shift_date: string; outcome: 'confirmed_absent' | 'not_absent' | null }> = []
    const rows = body.rows.map((row: any) => {
      const email = normalizeEmail(String(row?.agentEmail || ''))
      if (!rosterEmails.has(email)) throw new Error(`Unknown roster email: ${email}`)
      const day = dayByEmail.get(email)
      if (day && protectedStatuses.has(day.status)) throw new Error(`${day.agentName} is marked ${day.status}. Change the date exception before entering attendance.`)
      if (day?.exceptionKind === 'absent') throw new Error(`${day.agentName} has a legacy Absent date exception. Remove that exception before editing the attendance outcome.`)
      const timeIn = normalizeClock(row?.timeIn)
      const timeOut = normalizeClock(row?.timeOut)
      const recordDate = day?.shiftDate || shiftDate
      const storedTimeIn = timeIn ? `${recordDate} ${timeIn}` : null
      const storedTimeOut = timeOut ? `${recordDate} ${timeOut}` : null
      const sameTimeIn = Boolean(day && formatAttendanceTime(day.timeIn) === (timeIn || '--'))
      const sameTimeOut = Boolean(day && formatAttendanceTime(day.timeOut) === (timeOut || '--'))
      const isRdot = day?.status === 'Day Off' || Boolean(day?.status.startsWith('RDOT'))
      const timing = getAttendanceTiming({
        shiftDate: recordDate,
        startShift: day?.startShift || '',
        endShift: day?.endShift || '',
        timeIn: storedTimeIn,
        timeOut: storedTimeOut,
      })
      const requestedOutcome = row?.outcome === 'confirmed_absent' || row?.outcome === 'not_absent' ? row.outcome : row?.outcome == null || row?.outcome === '' ? null : 'invalid'
      if (requestedOutcome === 'invalid') throw new Error(`Invalid attendance outcome for ${day?.agentName || email}.`)
      if (requestedOutcome === 'confirmed_absent' && (timeIn || timeOut)) throw new Error(`${day?.agentName || email} cannot be confirmed Absent while attendance clocks are entered.`)
      if (requestedOutcome && (day?.status === 'Day Off' || day?.status.startsWith('RDOT'))) throw new Error(`${day.agentName} is on a scheduled rest day. Use RDOT clocks instead of an absence outcome.`)
      outcomes.push({ agent_email: email, shift_date: day?.shiftDate || shiftDate, outcome: requestedOutcome })
      return {
        agent_email: email,
        shift_date: recordDate,
        time_in: storedTimeIn,
        time_out: storedTimeOut,
        pre_shift_ot_approved: Boolean(day?.preShiftOtApproved && sameTimeIn),
        post_shift_ot_approved: Boolean(day?.postShiftOtApproved && sameTimeOut),
        pre_shift_ot_review: sameTimeIn
          ? day?.preShiftOtReview || 'not_required'
          : !isRdot && timing.preShiftOtMinutes >= OVERTIME_REVIEW_MINUTES ? 'pending' : 'not_required',
        post_shift_ot_review: sameTimeOut
          ? day?.postShiftOtReview || 'not_required'
          : !isRdot && timing.postShiftOtMinutes >= OVERTIME_REVIEW_MINUTES ? 'pending' : 'not_required',
        expected_updated_at: typeof row?.expectedUpdatedAt === 'string' ? row.expectedUpdatedAt : null,
      }
    })
    const result = await commitAttendanceRows({ shiftDate, source: 'manual', actor: user.email, rows, outcomes })
    return NextResponse.json({ success: true, result, saved: rows.length }, { headers: HEADERS })
  } catch (error: any) {
    const concurrent = error?.code === '40001' || /changed after preview/i.test(error?.message || '')
    const legacyForeignKey = error?.code === '23503' && /attendance_agent_fkey/i.test(error?.message || '')
    const missingCohortRpc = /commit_attendance_with_outcomes|attendance_day_outcomes/i.test(error?.message || '')
    return NextResponse.json({ error: concurrent
      ? 'Attendance changed while you were editing. Reload this date before saving.'
      : legacyForeignKey
        ? 'The database still has the legacy attendance-agent foreign key. Apply migration 28_remove_attendance_agent_foreign_key.sql, then retry.'
        : missingCohortRpc
          ? 'Apply migration 32_add_attendance_absence_outcomes.sql before saving attendance, then retry.'
        : error?.message || 'Unable to save manual attendance' }, { status: concurrent || legacyForeignKey || missingCohortRpc ? 409 : 500, headers: HEADERS })
  }
}
