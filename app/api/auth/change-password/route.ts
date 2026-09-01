import { NextRequest, NextResponse } from 'next/server'
import { setAuthCookie } from '@/lib/authCookie'
import { hashPassword, verifyPassword } from '@/lib/password'
import {
  clearPasswordChangeCookie,
  getPasswordChangeCookie,
} from '@/lib/passwordChangeCookie'
import { getPasswordPolicyError } from '@/lib/passwordPolicy'
import { createSessionToken, setSessionTokenCookie } from '@/lib/sessionToken'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

async function getPendingUser(request: NextRequest) {
  const recovery = getPasswordChangeCookie(request)
  if (!recovery) return null

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('email, name, avatar_image, role, is_active, password_hash, must_change_password, session_version')
    .eq('email', recovery.email)
    .maybeSingle()

  if (
    error ||
    !user ||
    user.is_active !== true ||
    !user.password_hash ||
    user.must_change_password !== true ||
    (user.session_version ?? 0) !== recovery.sessionVersion
  ) {
    return null
  }

  return user
}

function unauthorizedResponse() {
  const response = NextResponse.json(
    { error: 'Your password-change session is invalid or expired. Enter the temporary password again.' },
    { status: 401, headers: NO_STORE_HEADERS },
  )
  clearPasswordChangeCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const user = await getPendingUser(request)
  if (!user) return unauthorizedResponse()

  return NextResponse.json({ email: user.email }, { headers: NO_STORE_HEADERS })
}

export async function POST(request: NextRequest) {
  const user = await getPendingUser(request)
  if (!user) return unauthorizedResponse()

  let body: { password?: unknown; confirmPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  if (typeof body.password !== 'string' || typeof body.confirmPassword !== 'string') {
    return NextResponse.json({ error: 'Password and confirmation are required' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  if (body.password !== body.confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const policyError = getPasswordPolicyError(body.password)
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400, headers: NO_STORE_HEADERS })
  }

  if (await verifyPassword(body.password, user.password_hash)) {
    return NextResponse.json({ error: 'Your new password cannot be the temporary password' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const passwordHash = await hashPassword(body.password)
  const sessionToken = createSessionToken()
  const sessionVersion = user.session_version ?? 0
  const now = new Date().toISOString()
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      password_hash: passwordHash,
      must_change_password: false,
      token: sessionToken,
      last_login: now,
    })
    .eq('email', user.email)
    .eq('session_version', sessionVersion)
    .eq('must_change_password', true)
    .select('email')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500, headers: NO_STORE_HEADERS })
  }

  if (!updatedUser) return unauthorizedResponse()

  const response = NextResponse.json({
    email: user.email,
    name: user.name || '',
    avatar_image: user.avatar_image,
    role: user.role,
  }, { headers: NO_STORE_HEADERS })

  setSessionTokenCookie(response, sessionToken)
  setAuthCookie(response, {
    email: user.email,
    name: user.name,
    avatar_image: user.avatar_image,
    role: user.role,
    company: null,
    session_version: sessionVersion,
  }, sessionToken)
  clearPasswordChangeCookie(response)
  return response
}
