import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { createScheduleVersion, loadAttendanceRoster, loadScheduleEditor, prepareScheduleRevert } from '@/lib/attendanceService'
import { getDefaultShiftDate, isDateKey, normalizeEmail } from '@/lib/attendance'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

const authorize = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (!canManageAttendance(user.role)) return { response: NextResponse.json({ error: 'Schedule management access denied' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const effectiveFrom = request.nextUrl.searchParams.get('effectiveFrom') || getDefaultShiftDate()
    if (!isDateKey(effectiveFrom)) return NextResponse.json({ error: 'A valid effective date is required.' }, { status: 400, headers: HEADERS })
    const roster = await loadAttendanceRoster()
    const revertVersionId = request.nextUrl.searchParams.get('revertVersionId')?.trim()
    if (revertVersionId) {
      const revert = await prepareScheduleRevert(revertVersionId, roster)
      return NextResponse.json(revert, { headers: HEADERS })
    }
    const editor = await loadScheduleEditor(effectiveFrom, roster)
    return NextResponse.json({ ...editor, rosterDefaults: roster, effectiveFrom }, { headers: HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load schedule editor' }, { status: 500, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json()
    const effectiveFrom = typeof body?.effectiveFrom === 'string' ? body.effectiveFrom : ''
    if (!isDateKey(effectiveFrom)) return NextResponse.json({ error: 'A valid effective date is required.' }, { status: 400, headers: HEADERS })
    if (effectiveFrom < getDefaultShiftDate() && body?.confirmHistorical !== true) {
      return NextResponse.json({ error: 'Historical schedule corrections require explicit confirmation.' }, { status: 409, headers: HEADERS })
    }
    if (!Array.isArray(body?.entries)) return NextResponse.json({ error: 'A complete schedule is required.' }, { status: 400, headers: HEADERS })

    const roster = await loadAttendanceRoster()
    const rosterByEmail = new Map(roster.map((agent) => [agent.email, agent]))
    const seen = new Set<string>()
    const entries = body.entries.map((entry: any) => {
      const email = normalizeEmail(String(entry?.email || ''))
      const agent = rosterByEmail.get(email)
      if (!agent) throw new Error(`Schedule contains an unknown or inactive roster email: ${email}`)
      if (seen.has(email)) throw new Error(`Schedule contains ${agent.name} more than once.`)
      seen.add(email)
      const shiftGroup = entry?.shiftGroup === 'overnight' ? 'overnight' : 'normal_graveyard'
      return {
        ...agent,
        teamLeader: typeof entry?.teamLeader === 'string' ? entry.teamLeader.trim() : agent.teamLeader,
        startShift: typeof entry?.startShift === 'string' ? entry.startShift.trim() : '',
        endShift: typeof entry?.endShift === 'string' ? entry.endShift.trim() : '',
        off1: typeof entry?.off1 === 'string' ? entry.off1.trim() : '',
        off2: typeof entry?.off2 === 'string' ? entry.off2.trim() : '',
        shiftGroup,
      }
    })
    const missing = roster.filter((agent) => !seen.has(agent.email))
    if (missing.length) return NextResponse.json({ error: `Complete roster snapshot required. Missing: ${missing.map((agent) => agent.name).join(', ')}` }, { status: 400, headers: HEADERS })
    const id = await createScheduleVersion(effectiveFrom, typeof body?.note === 'string' ? body.note : '', entries, auth.user.email)
    return NextResponse.json({ success: true, id, saved: entries.length }, { headers: HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save schedule' }, { status: 500, headers: HEADERS })
  }
}
