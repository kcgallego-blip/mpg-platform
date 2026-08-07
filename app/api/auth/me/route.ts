import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { clearAuthCookie, setAuthCookie } from '@/lib/authCookie'
import {
  clearSessionTokenCookie,
  getSessionTokenCookie,
  setSessionTokenCookie,
} from '@/lib/sessionToken'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = getSessionTokenCookie(request)
    const user = await getAuthenticatedDbUser(request)

    if (!user || !sessionToken) {
      const response = NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      clearAuthCookie(response)
      clearSessionTokenCookie(response)
      return response
    }

    const response = NextResponse.json({
      email: user.email,
      name: user.name || '',
      avatar_image: user.avatar_image,
      role: user.role,
      company: null,
    })

    // Called when the app opens and after real user activity. Re-issuing both
    // cookies makes the three-day expiry sliding without background tabs
    // keeping an inactive session alive forever.
    setSessionTokenCookie(response, sessionToken)
    setAuthCookie(response, {
      email: user.email,
      name: user.name,
      avatar_image: user.avatar_image,
      role: user.role,
      company: null,
    }, sessionToken)

    return response
  } catch (error) {
    console.error('Auth check error:', error)
    const response = NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
    clearAuthCookie(response)
    clearSessionTokenCookie(response)
    return response
  }
}
