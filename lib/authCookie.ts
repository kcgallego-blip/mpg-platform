import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_IDLE_TIMEOUT_SECONDS } from './sessionToken'

export const AUTH_COOKIE_NAME = 'webex_auth'

type AuthCookiePayload = {
  email: string
  name: string | null
  avatar_image?: string | null
  company?: string | null
  role?: string | null
  iat: number
  exp: number
}

export type AuthenticatedUser = Omit<AuthCookiePayload, 'iat' | 'exp'>

function getAuthCookieSecret() {
  return (
    process.env.AUTH_COOKIE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.WEBEX_CLIENT_SECRET ||
    null
  )
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}

function signPayload(payload: AuthCookiePayload, sessionToken: string) {
  const secret = getAuthCookieSecret()

  if (!secret) return null

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`${body}.${sessionToken}`)
    .digest('base64url')

  return `${body}.${signature}`
}

function verifyPayload(value: string, sessionToken: string): AuthCookiePayload | null {
  const secret = getAuthCookieSecret()

  if (!secret) return null

  const [body, signature] = value.split('.')

  if (!body || !signature) {
    return null
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${body}.${sessionToken}`)
    .digest('base64url')

  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthCookiePayload
    const now = Math.floor(Date.now() / 1000)

    if (
      !payload.email ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= now ||
      payload.iat + SESSION_IDLE_TIMEOUT_SECONDS <= now
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function signAuthCookie(user: AuthenticatedUser, sessionToken: string) {
  const now = Math.floor(Date.now() / 1000)

  return signPayload({
    ...user,
    iat: now,
    exp: now + SESSION_IDLE_TIMEOUT_SECONDS,
  }, sessionToken)
}

export function verifyAuthCookie(value: string, sessionToken: string): AuthenticatedUser | null {
  return verifyPayload(value, sessionToken) ?? null
}

export function setAuthCookie(
  response: NextResponse,
  user: AuthenticatedUser,
  sessionToken: string,
) {
  const signedCookie = signAuthCookie(user, sessionToken)

  if (!signedCookie) return

  response.cookies.set(AUTH_COOKIE_NAME, signedCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_IDLE_TIMEOUT_SECONDS,
  })
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.delete(AUTH_COOKIE_NAME)
}

export function getAuthCookieUser(
  request: NextRequest,
  sessionToken: string,
): AuthenticatedUser | null {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)

  if (!authCookie?.value) {
    return null
  }

  return verifyAuthCookie(authCookie.value, sessionToken)
}
