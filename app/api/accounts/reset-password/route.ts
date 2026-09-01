import { NextRequest, NextResponse } from 'next/server'
import { canResetLocalPassword, canViewAccounts } from '@/lib/accountAccess'
import { hashPassword } from '@/lib/password'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { generateTemporaryPassword } from '@/lib/temporaryPassword'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedDbUser(request)

  if (!actor) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  if (!canViewAccounts(actor.role)) {
    return NextResponse.json({ error: 'Admin or IT access required' }, { status: 403, headers: NO_STORE_HEADERS })
  }

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  if (typeof body.email !== 'string' || !body.email.trim()) {
    return NextResponse.json({ error: 'Target email is required' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const targetEmail = body.email.trim().toLowerCase()
  const { data: target, error: targetError } = await supabaseAdmin
    .from('users')
    .select('email, role, password_hash, session_version')
    .eq('email', targetEmail)
    .maybeSingle()

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500, headers: NO_STORE_HEADERS })
  }

  if (!target) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404, headers: NO_STORE_HEADERS })
  }

  if (!target.password_hash) {
    return NextResponse.json({ error: 'This account uses Webex and has no local password' }, { status: 409, headers: NO_STORE_HEADERS })
  }

  if (!canResetLocalPassword(actor, {
    email: target.email,
    role: target.role,
    hasLocalPassword: true,
  })) {
    return NextResponse.json({ error: 'You cannot reset this account password' }, { status: 403, headers: NO_STORE_HEADERS })
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const currentVersion = target.session_version ?? 0
  const nextVersion = currentVersion + 1

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      password_hash: passwordHash,
      must_change_password: true,
      password_reset_requested_at: new Date().toISOString(),
      password_reset_requested_by: actor.email,
      session_version: nextVersion,
      token: null,
    })
    .eq('email', target.email)
    .eq('session_version', currentVersion)
    .select('email')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS })
  }

  if (!updatedUser) {
    return NextResponse.json({ error: 'Account changed during reset. Please try again.' }, { status: 409, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json({ temporaryPassword }, { headers: NO_STORE_HEADERS })
}

