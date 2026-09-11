import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { isDateKey, normalizeEmail } from '@/lib/attendance'
import { isClockMigrationMissing, loadClockPolicyRoster, reviewOvertime } from '@/lib/attendanceClockService'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS })
    if (!canManageAttendance(user.role)) return NextResponse.json({ error: 'Overtime review access denied' }, { status: 403, headers: HEADERS })
    const body = await request.json().catch(() => null)
    const email = normalizeEmail(String(body?.agentEmail || ''))
    const shiftDate = String(body?.shiftDate || '')
    const field = body?.field
    const decision = body?.decision
    if (!isDateKey(shiftDate) || !['pre_shift', 'post_shift'].includes(field) || !['approve', 'reject'].includes(decision)) return NextResponse.json({ error: 'Valid Agent, shift date, review field, and decision are required.' }, { status: 400, headers: HEADERS })
    const roster = await loadClockPolicyRoster()
    if (!roster.some((agent) => agent.email === email)) return NextResponse.json({ error: 'Agent is not in the active roster.' }, { status: 404, headers: HEADERS })
    await reviewOvertime({ email, shiftDate, field, decision, actor: user.email, expectedUpdatedAt: typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null })
    return NextResponse.json({ success: true }, { headers: HEADERS })
  } catch (error: any) {
    const concurrent = error?.code === '40001' || /changed|no longer pending/i.test(error?.message || '')
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before reviewing overtime.' : concurrent ? 'Attendance changed before this review. Refresh and try again.' : error?.message || 'Unable to review overtime' }, { status: isClockMigrationMissing(error) || concurrent ? 409 : 500, headers: HEADERS })
  }
}
