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

  if (sessionToken) {
    const { data: tokenUser, error: tokenError } = await supabase
      .from('users')
      .select('email, name, avatar_image, role, is_active')
      .eq('token', sessionToken)
      .maybeSingle()

    if (!tokenError && tokenUser?.is_active === true) {
      return tokenUser
    }
  }

  const cookieUser = getAuthCookieUser(request)

  if (!cookieUser?.email) {
    return null
  }

  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('email, name, avatar_image, role, is_active')
    .eq('email', cookieUser.email)
    .maybeSingle()

  if (dbError || !dbUser || dbUser.is_active !== true) {
    return null
  }

  return dbUser
}
