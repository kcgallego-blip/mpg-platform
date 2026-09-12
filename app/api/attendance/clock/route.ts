import { NextRequest, NextResponse } from 'next/server'
import { getRequestIp } from '@/lib/attendanceNetwork'
import { isClockMigrationMissing, isPhilippineClockMigrationMissing, loadAgentClockState, performAgentClock } from '@/lib/attendanceClockService'
import type { ClockAction, ClockSurface } from '@/lib/attendanceClock'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const authorizeAgent = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (user.role?.trim().toLowerCase() !== 'agent') return { response: NextResponse.json({ error: 'Agent self-service access required' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAgent(request)
    if ('response' in auth) return auth.response
    const result = await loadAgentClockState(auth.user.email, getRequestIp(request.headers))
    return NextResponse.json(result.state, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before using Agent clocking.' : error?.message || 'Unable to load clock status' }, { status: isClockMigrationMissing(error) ? 409 : 500, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAgent(request)
    if ('response' in auth) return auth.response
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !['action', 'surface', 'requestId'].includes(key))) {
      return NextResponse.json({ error: 'Only action, surface, and requestId are accepted.' }, { status: 400, headers: HEADERS })
    }
    const action = body?.action as ClockAction
    const surface = body?.surface as ClockSurface
    const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
    if (!['time_in', 'time_out'].includes(action)) return NextResponse.json({ error: 'Invalid clock action.' }, { status: 400, headers: HEADERS })
    if (!['attendance', 'home'].includes(surface)) return NextResponse.json({ error: 'Invalid clock surface.' }, { status: 400, headers: HEADERS })
    if (!UUID.test(requestId)) return NextResponse.json({ error: 'A valid request identifier is required.' }, { status: 400, headers: HEADERS })
    const state = await performAgentClock({
      email: auth.user.email,
      action,
      surface,
      requestId,
      ip: getRequestIp(request.headers),
      userAgent: request.headers.get('user-agent') || '',
    })
    return NextResponse.json(state, { headers: HEADERS })
  } catch (error: any) {
    const concurrent = error?.code === '40001' || /already exists|required before|changed|correction/i.test(error?.message || '')
    const status = Number(error?.status) || (isClockMigrationMissing(error) ? 409 : concurrent ? 409 : 500)
    const migrationError = isPhilippineClockMigrationMissing(error)
      ? 'Apply migration 34_use_philippine_self_service_clock.sql before using Agent clocking.'
      : isClockMigrationMissing(error)
        ? 'Apply migration 33_add_agent_self_service_clock.sql before using Agent clocking.'
        : null
    return NextResponse.json({ error: migrationError || error?.message || 'Unable to save clock action' }, { status, headers: HEADERS })
  }
}
