import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { loadAttendanceRoster, upsertScheduleExceptions } from '@/lib/attendanceService'
import { ScheduleException, ScheduleExceptionKind, isDateKey, normalizeEmail } from '@/lib/attendance'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const KINDS = new Set<ScheduleExceptionKind>(['holiday_off', 'vacation_leave', 'sick_leave', 'transition_off', 'day_off', 'scheduled'])

const authorize = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (!canManageAttendance(user.role)) return { response: NextResponse.json({ error: 'Schedule exception access denied' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const shiftDate = request.nextUrl.searchParams.get('shiftDate') || ''
    if (!isDateKey(shiftDate)) return NextResponse.json({ error: 'A valid shift date is required.' }, { status: 400, headers: HEADERS })
    const { data, error } = await supabaseAdmin
      .from('attendance_schedule_exceptions')
      .select('id, agent_email, shift_date, kind, start_shift, end_shift, note, updated_by, updated_at')
      .eq('shift_date', shiftDate)
      .order('agent_email', { ascending: true })
    if (error) throw error
    return NextResponse.json({ exceptions: data || [] }, { headers: HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load exceptions' }, { status: 500, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json()
    if (!Array.isArray(body?.entries) || !body.entries.length) return NextResponse.json({ error: 'Select at least one agent/date exception.' }, { status: 400, headers: HEADERS })
    const roster = await loadAttendanceRoster()
    const rosterEmails = new Set(roster.map((agent) => agent.email))
    const seen = new Set<string>()
    const entries: ScheduleException[] = body.entries.map((entry: any) => {
      const agentEmail = normalizeEmail(String(entry?.agentEmail || ''))
      const shiftDate = String(entry?.shiftDate || '')
      const kind = entry?.kind as ScheduleExceptionKind
      if (!rosterEmails.has(agentEmail)) throw new Error(`Unknown active roster email: ${agentEmail}`)
      if (!isDateKey(shiftDate)) throw new Error(`Invalid exception shift date for ${agentEmail}.`)
      if (!KINDS.has(kind)) throw new Error(`Invalid schedule exception for ${agentEmail}.`)
      if (kind === 'scheduled' && (!String(entry?.startShift || '').trim() || !String(entry?.endShift || '').trim())) {
        throw new Error(`A one-day scheduled shift requires start and end times for ${agentEmail}.`)
      }
      const key = `${agentEmail}|${shiftDate}`
      if (seen.has(key)) throw new Error(`Duplicate exception for ${agentEmail} on ${shiftDate}.`)
      seen.add(key)
      return {
        agentEmail,
        shiftDate,
        kind,
        startShift: typeof entry?.startShift === 'string' ? entry.startShift.trim() : null,
        endShift: typeof entry?.endShift === 'string' ? entry.endShift.trim() : null,
        note: typeof entry?.note === 'string' ? entry.note.trim() : null,
      }
    })
    const saved = await upsertScheduleExceptions(entries, auth.user.email)
    return NextResponse.json({ success: true, saved }, { headers: HEADERS })
  } catch (error: any) {
    const outdatedKinds = error?.code === '23514' && /attendance_schedule_exceptions_kind_check/i.test(error?.message || '')
    return NextResponse.json({ error: outdatedKinds
      ? 'The database does not support Vacation Leave and Sick Leave yet. Apply migration 29_add_attendance_leave_and_absence_types.sql, then retry.'
      : error instanceof Error ? error.message : 'Unable to save schedule exceptions' }, { status: outdatedKinds ? 409 : 500, headers: HEADERS })
  }
}
