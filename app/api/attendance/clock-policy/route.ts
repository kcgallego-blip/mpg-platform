import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { isClockMigrationMissing, loadClockPolicyRoster, replaceClockWfh } from '@/lib/attendanceClockService'
import { normalizeEmail } from '@/lib/attendance'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

const authorize = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (!canManageAttendance(user.role)) return { response: NextResponse.json({ error: 'Attendance policy access denied' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    return NextResponse.json({ agents: await loadClockPolicyRoster(), canManagePilot: auth.user.role === 'Admin' }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before managing clock policies.' : error?.message || 'Unable to load clock policy' }, { status: isClockMigrationMissing(error) ? 409 : 500, headers: HEADERS })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.wfhEmails)) return NextResponse.json({ error: 'WFH roster selection is required.' }, { status: 400, headers: HEADERS })
    const agents = await loadClockPolicyRoster()
    const valid = new Set(agents.map((agent) => agent.email))
    const normalizedEmails: string[] = body.wfhEmails.map((value: unknown) => normalizeEmail(String(value)))
    if (new Set(normalizedEmails).size !== normalizedEmails.length) return NextResponse.json({ error: 'WFH Agents cannot be duplicated.' }, { status: 400, headers: HEADERS })
    const emails = normalizedEmails
    const unknown = emails.filter((email) => !valid.has(email))
    if (unknown.length) return NextResponse.json({ error: `Unknown or inactive roster emails: ${unknown.join(', ')}` }, { status: 400, headers: HEADERS })
    const saved = await replaceClockWfh(emails, auth.user.email)
    return NextResponse.json({ success: true, saved }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before managing clock policies.' : error?.message || 'Unable to save WFH policy' }, { status: isClockMigrationMissing(error) ? 409 : 500, headers: HEADERS })
  }
}
