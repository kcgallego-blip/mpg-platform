import { NextRequest, NextResponse } from 'next/server'
import { canManageAttendance } from '@/lib/attendanceAccess'
import { previewTrackerOrder, validateTrackerOrder } from '@/lib/attendanceManagement'
import { loadAttendanceRoster, loadTrackerOrder, replaceTrackerOrder } from '@/lib/attendanceService'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

const getDatabaseError = (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object') return { message: fallback, code: null }
  const candidate = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
  const rawMessage = typeof candidate.message === 'string' ? candidate.message : fallback
  const code = typeof candidate.code === 'string' ? candidate.code : null

  if (code === 'PGRST202' || /could not find the function|schema cache/i.test(rawMessage)) {
    return {
      message: 'The tracker-order database function is unavailable. Apply migration 27_refresh_attendance_tracker_order_rpc.sql in Supabase, then try again.',
      code,
    }
  }
  if (code === '42P01' || /attendance_tracker_order.*does not exist/i.test(rawMessage)) {
    return {
      message: 'The attendance management tables are not installed. Apply migration 26_create_attendance_management.sql first.',
      code,
    }
  }
  if (code === '42501' || /permission denied/i.test(rawMessage)) {
    return {
      message: 'The server role cannot run the tracker-order function. Apply migration 27_refresh_attendance_tracker_order_rpc.sql to repair its grant.',
      code,
    }
  }
  return { message: rawMessage, code }
}

const authorize = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (!canManageAttendance(user.role)) return { response: NextResponse.json({ error: 'Attendance management access denied' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const roster = await loadAttendanceRoster()
    const order = await loadTrackerOrder(roster)
    return NextResponse.json({
      ready: order.ready,
      issues: order.issues,
      agents: order.agents.map((agent, index) => ({ ...agent, position: index + 1 })),
      roster,
      updatedBy: order.updatedBy,
      updatedAt: order.updatedAt,
    }, { headers: HEADERS })
  } catch (error) {
    const databaseError = getDatabaseError(error, 'Unable to load tracker order')
    console.error('Unable to load tracker order:', databaseError)
    return NextResponse.json({ error: databaseError.message, code: databaseError.code }, { status: 500, headers: HEADERS })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json()
    const rawText = typeof body?.rawText === 'string' ? body.rawText : ''
    const roster = await loadAttendanceRoster()
    return NextResponse.json(previewTrackerOrder(rawText, roster), { headers: HEADERS })
  } catch (error) {
    const databaseError = getDatabaseError(error, 'Unable to preview tracker order')
    console.error('Unable to preview tracker order:', databaseError)
    return NextResponse.json({ error: databaseError.message, code: databaseError.code }, { status: 500, headers: HEADERS })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json()
    const rawText = typeof body?.rawText === 'string' ? body.rawText : ''
    const selections = body?.selections && typeof body.selections === 'object'
      ? body.selections as Record<string, string>
      : {}
    const roster = await loadAttendanceRoster()
    const validation = validateTrackerOrder(rawText, roster, selections)
    if (!validation.valid) return NextResponse.json({ error: 'Tracker order was not saved.', issues: validation.issues }, { status: 400, headers: HEADERS })
    const saved = await replaceTrackerOrder(validation.agents, auth.user.email)
    return NextResponse.json({ success: true, saved, agents: validation.agents }, { headers: HEADERS })
  } catch (error) {
    const databaseError = getDatabaseError(error, 'Unable to save tracker order')
    console.error('Unable to save tracker order:', databaseError)
    return NextResponse.json({ error: databaseError.message, code: databaseError.code }, { status: 500, headers: HEADERS })
  }
}
