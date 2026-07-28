import { NextRequest } from 'next/server'
import { getAuthCookieUser } from './authCookie'
import { getSessionTokenCookie } from './sessionToken'
import { supabase } from './supabase'

export type AuthenticatedDbUser = {
  email: string
  name: string | null
  avatar_image: string | null
  role: string | null
  is_active: boolean
}

export async function getAuthenticatedDbUser(request: NextRequest): Promise<AuthenticatedDbUser | null> {
  const sessionToken = getSessionTokenCookie(request)

  if (!sessionToken) {
    return null
  }

  const cachedUser = getAuthCookieUser(request, sessionToken)

  if (cachedUser) {
    return {
      email: cachedUser.email,
      name: cachedUser.name,
      avatar_image: cachedUser.avatar_image ?? null,
      role: cachedUser.role ?? null,
      is_active: true,
    }
  }

  // Backward compatibility for sessions created before RBAC snapshots were
  // introduced. A fresh login upgrades the session to the no-query path.
  const { data: tokenUser, error: tokenError } = await supabase
    .from('users')
    .select('email, name, avatar_image, role, is_active')
    .eq('token', sessionToken)
    .maybeSingle()

  if (!tokenError && tokenUser?.is_active === true) {
    return tokenUser
  }

  return null
}
