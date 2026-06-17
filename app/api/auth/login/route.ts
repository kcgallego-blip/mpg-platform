import { NextRequest, NextResponse } from 'next/server'
import { setSessionTokenCookie, createSessionToken } from '@/lib/sessionToken'
import { supabase } from '@/lib/supabase'
import { verifyPassword } from '@/lib/password'

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

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name, avatar_image, role, is_active, password_hash')
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

    const sessionToken = createSessionToken()
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('users')
      .update({ token: sessionToken, last_login: now })
      .eq('email', normalizedEmail)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const response = NextResponse.json({
      email: user.email,
      name: user.name || '',
      avatar_image: user.avatar_image,
      role: user.role,
    })

    setSessionTokenCookie(response, sessionToken)

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
