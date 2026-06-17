import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const SESSION_COOKIE_NAME = 'mpg_session_token'
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function createSessionToken() {
  return randomBytes(48).toString('base64url')
}

export function setSessionTokenCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  })
}

export function getSessionTokenCookie(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null
}

export function clearSessionTokenCookie(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE_NAME)
}
