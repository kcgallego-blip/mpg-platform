import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken } from '@/lib/sessionToken'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/password'

const ALLOWED_EMAIL_DOMAIN = '@m-piece.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, password } = body

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = name.trim()
    const now = new Date().toISOString()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedEmail.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return NextResponse.json({ error: 'Email is not valid' }, { status: 400 })
    }

    if (normalizedName.length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
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

    const passwordHash = await hashPassword(password)
    const sessionToken = createSessionToken()

    const { error: profileError } = await supabase
      .from('users')
      .insert({
        email: normalizedEmail,
        name: normalizedName,
        password_hash: passwordHash,
        token: sessionToken,
        role: 'Agent',
        registered_at: now,
        is_active: false,
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      email: normalizedEmail,
      name: normalizedName,
      role: 'Agent',
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
