import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const PASSWORD_CHANGE_COOKIE_NAME = 'mpg_password_change'
export const PASSWORD_CHANGE_SESSION_SECONDS = 60 * 15

type PasswordChangePayload = {
  email: string
  sessionVersion: number
  iat: number
  exp: number
  purpose: 'password-change'
}

function getCookieSecret() {
  return (
    process.env.AUTH_COOKIE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.WEBEX_CLIENT_SECRET ||
    null
  )
}

function createSignature(body: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`password-change.${body}`)
    .digest('base64url')
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue)
  const right = Buffer.from(rightValue)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function signPasswordChangeCookie(email: string, sessionVersion: number) {
  const secret = getCookieSecret()
  if (!secret) return null

  const now = Math.floor(Date.now() / 1000)
  const payload: PasswordChangePayload = {
    email,
    sessionVersion,
    iat: now,
    exp: now + PASSWORD_CHANGE_SESSION_SECONDS,
    purpose: 'password-change',
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${createSignature(body, secret)}`
}

export function verifyPasswordChangeCookie(value: string): PasswordChangePayload | null {
  const secret = getCookieSecret()
  if (!secret) return null

  const [body, signature] = value.split('.')
  if (!body || !signature || !safeEqual(signature, createSignature(body, secret))) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PasswordChangePayload
    const now = Math.floor(Date.now() / 1000)

    if (
      payload.purpose !== 'password-change' ||
      !payload.email ||
      !Number.isInteger(payload.sessionVersion) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function setPasswordChangeCookie(
  response: NextResponse,
  email: string,
  sessionVersion: number,
) {
  const value = signPasswordChangeCookie(email, sessionVersion)
  if (!value) return false

  response.cookies.set(PASSWORD_CHANGE_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: PASSWORD_CHANGE_SESSION_SECONDS,
  })
  return true
}

export function getPasswordChangeCookie(request: NextRequest) {
  const value = request.cookies.get(PASSWORD_CHANGE_COOKIE_NAME)?.value
  return value ? verifyPasswordChangeCookie(value) : null
}

export function clearPasswordChangeCookie(response: NextResponse) {
  response.cookies.delete(PASSWORD_CHANGE_COOKIE_NAME)
}
