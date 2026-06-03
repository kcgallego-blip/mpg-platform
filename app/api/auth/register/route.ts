import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { randomUUID } from 'crypto'

const ALLOWED_EMAIL_DOMAIN = '@m-piece.com'

const createRegistrationToken = () => {
  const encodedId = Buffer.from(randomUUID()).toString('base64url')
  return `${encodedId}_${randomUUID()}`
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const now = new Date().toISOString()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedEmail.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return NextResponse.json({ error: 'Email is not valid' }, { status: 400 })
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message }, { status: 500 })
    }

    if (existingUser) {
      return NextResponse.json({ error: 'Account is already registered' }, { status: 409 })
    }

    const token = createRegistrationToken()

    const { error: profileError } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        name: null,
        role: null,
        token,
        registered_at: now,
        last_login: now,
        is_active: true,
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const response = NextResponse.json({
      email: normalizedEmail,
      name: '',
      company: '',
      avatar_image: null,
      role: null,
      token,
    })

    response.cookies.set('webex_auth', JSON.stringify({
      email: normalizedEmail,
      name: '',
      token,
      avatar_image: null,
      company: null,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
