import { NextRequest, NextResponse } from 'next/server'
import { clearSessionTokenCookie, setSessionTokenCookie, createSessionToken } from '@/lib/sessionToken'
import { verifyPassword } from '@/lib/password'
import { clearAuthCookie, setAuthCookie } from '@/lib/authCookie'
import { clearPasswordChangeCookie, setPasswordChangeCookie } from '@/lib/passwordChangeCookie'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ALLOWED_EMAIL_DOMAIN = '@m-piece.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedEmail.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return NextResponse.json({ error: 'Email is not valid' }, { status: 400 })
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, name, avatar_image, role, is_active, password_hash, must_change_password, session_version')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (user.is_active !== true) {
      return NextResponse.json({ error: 'Account is pending approval. Please contact an administrator.' }, { status: 401 })
    }

    if (!user.password_hash) {
      return NextResponse.json({ error: 'Password is not configured. Use Webex login or contact an administrator.' }, { status: 401 })
    }

    const isValidPassword = await verifyPassword(password, user.password_hash)

    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const sessionVersion = user.session_version ?? 0

    if (user.must_change_password === true) {
      const response = NextResponse.json(
        { requiresPasswordChange: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )

      clearAuthCookie(response)
      clearSessionTokenCookie(response)

      if (!setPasswordChangeCookie(response, user.email, sessionVersion)) {
        return NextResponse.json({ error: 'Password-change sessions are not configured' }, { status: 500 })
      }

      return response
    }

    const sessionToken = createSessionToken()
    const now = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ token: sessionToken, last_login: now })
      .eq('email', normalizedEmail)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const response = NextResponse.json({
      requiresPasswordChange: false,
      user: {
        email: user.email,
        name: user.name || '',
        avatar_image: user.avatar_image,
        role: user.role,
      },
    })

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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
