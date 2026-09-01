import { NextRequest } from 'next/server'
import { getAuthCookieUser } from './authCookie'
import { getSessionTokenCookie } from './sessionToken'
import { supabaseAdmin } from './supabaseAdmin'
import { sessionVersionsMatch } from './accountAccess'

export type AuthenticatedDbUser = {
  email: string
  name: string | null
  avatar_image: string | null
  role: string | null
  is_active: boolean
  session_version: number
}

export async function getAuthenticatedDbUser(request: NextRequest): Promise<AuthenticatedDbUser | null> {
  const sessionToken = getSessionTokenCookie(request)

  if (!sessionToken) {
    return null
  }

  const cachedUser = getAuthCookieUser(request, sessionToken)

  if (!cachedUser) return null

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('email, name, avatar_image, role, is_active, session_version')
    .eq('email', cachedUser.email)
    .maybeSingle()

  if (
    error ||
    !user ||
    user.is_active !== true ||
    !sessionVersionsMatch(cachedUser.session_version, user.session_version)
  ) {
    return null
  }

  return {
    email: user.email,
    name: user.name,
    avatar_image: user.avatar_image ?? null,
    role: user.role ?? null,
    is_active: true,
    session_version: user.session_version ?? 0,
  }
}
