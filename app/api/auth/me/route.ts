import { NextRequest, NextResponse } from 'next/server'
import { getAuthCookieUser } from '@/lib/authCookie'
import { clearSessionTokenCookie, getSessionTokenCookie } from '@/lib/sessionToken'
import { supabase } from '@/lib/supabase'

function unauthorized() {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}

function authenticatedUser(user: {
  email: string
  name: string | null
  avatar_image: string | null
  role: string | null
}) {
  return NextResponse.json({
    email: user.email,
    name: user.name || '',
    avatar_image: user.avatar_image,
    role: user.role,
    company: null,
  })
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken = getSessionTokenCookie(request)

    if (sessionToken) {
      const { data: tokenUser, error: tokenError } = await supabase
        .from('users')
        .select('email, name, avatar_image, role, is_active')
        .eq('token', sessionToken)
        .maybeSingle()

      if (!tokenError && tokenUser?.is_active === true) {
        return authenticatedUser(tokenUser)
      }

      const response = unauthorized()
      clearSessionTokenCookie(response)
      return response
    }

    const cookieUser = getAuthCookieUser(request)

    if (!cookieUser?.email) {
      return unauthorized()
    }

    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('email, name, avatar_image, role, is_active')
      .eq('email', cookieUser.email)
      .single()

    if (dbError || !dbUser || dbUser.is_active !== true) {
      return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
    }

    return authenticatedUser(dbUser)
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
  }
}
