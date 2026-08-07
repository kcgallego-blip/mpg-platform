import { NextRequest } from 'next/server'
import { getAuthCookieUser } from './authCookie'
import { getSessionTokenCookie } from './sessionToken'

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

  // The signed snapshot carries the issued-at time used for the inactivity
  // limit. A database token alone cannot prove when the browser was active.
  return null
}
