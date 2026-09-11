import { NextRequest, NextResponse } from 'next/server'
import { normalizeEmail } from '@/lib/attendance'
import { isClockMigrationMissing, loadClockPolicyRoster, loadOfficeNetworks, replaceClockPilot, replaceOfficeNetworks } from '@/lib/attendanceClockService'
import { normalizeOfficeNetwork } from '@/lib/attendanceNetwork'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
const db = supabaseAdmin as any

const authorize = async (request: NextRequest) => {
  const user = await getAuthenticatedDbUser(request)
  if (!user) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: HEADERS }) }
  if (user.role !== 'Admin') return { response: NextResponse.json({ error: 'Administrator access required' }, { status: 403, headers: HEADERS }) }
  return { user }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const [agents, networks, auditResult] = await Promise.all([
      loadClockPolicyRoster(), loadOfficeNetworks(),
      db.from('attendance_clock_policy_audit').select('changed_by, changed_at').eq('changed_field', 'self_service_enabled').order('changed_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (auditResult.error) throw auditResult.error
    return NextResponse.json({ agents, networks, lastPilotUpdate: auditResult.data || null }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before configuring Agent clocking.' : error?.message || 'Unable to load Agent clock settings' }, { status: isClockMigrationMissing(error) ? 409 : 500, headers: HEADERS })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorize(request)
    if ('response' in auth) return auth.response
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.enabledEmails) || !Array.isArray(body?.networks)) return NextResponse.json({ error: 'Enabled Agents and office networks are required.' }, { status: 400, headers: HEADERS })
    const agents = await loadClockPolicyRoster()
    const valid = new Set(agents.map((agent) => agent.email))
    const normalizedEmails: string[] = body.enabledEmails.map((value: unknown) => normalizeEmail(String(value)))
    if (new Set(normalizedEmails).size !== normalizedEmails.length) return NextResponse.json({ error: 'Pilot Agents cannot be duplicated.' }, { status: 400, headers: HEADERS })
    const emails = normalizedEmails
    const unknown = emails.filter((email) => !valid.has(email))
    if (unknown.length) return NextResponse.json({ error: `Unknown or inactive roster emails: ${unknown.join(', ')}` }, { status: 400, headers: HEADERS })
    const networks = body.networks.map((entry: any) => ({
      label: typeof entry?.label === 'string' ? entry.label.trim() : '',
      network: normalizeOfficeNetwork(String(entry?.network || '')),
    }))
    if (networks.some((entry: any) => !entry.label)) return NextResponse.json({ error: 'Every office network requires a label.' }, { status: 400, headers: HEADERS })
    if (new Set(networks.map((entry: any) => entry.network)).size !== networks.length) return NextResponse.json({ error: 'Office networks cannot be duplicated.' }, { status: 400, headers: HEADERS })
    const [enabled, savedNetworks] = await Promise.all([
      replaceClockPilot(emails, auth.user.email), replaceOfficeNetworks(networks, auth.user.email),
    ])
    return NextResponse.json({ success: true, enabled, savedNetworks }, { headers: HEADERS })
  } catch (error: any) {
    return NextResponse.json({ error: isClockMigrationMissing(error) ? 'Apply migration 33_add_agent_self_service_clock.sql before configuring Agent clocking.' : error?.message || 'Unable to save Agent clock settings' }, { status: isClockMigrationMissing(error) ? 409 : 500, headers: HEADERS })
  }
}
