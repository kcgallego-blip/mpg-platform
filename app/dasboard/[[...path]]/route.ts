import { NextRequest, NextResponse } from 'next/server'
import { getPostLoginRoute } from '@/lib/routes'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

/** Redirect legacy dashboard bookmarks to the current role-specific landing page. */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedDbUser(request)
  const destination = user ? getPostLoginRoute(user.role) : '/login'

  return NextResponse.redirect(new URL(destination, request.url))
}
