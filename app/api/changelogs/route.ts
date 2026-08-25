import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  getPublishedChangelogPage,
  getPublishedChangelogsAfter,
} from '@/lib/changelogServer'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'

const CONTENT_HEADERS = {
  'Cache-Control': 'private, max-age=300, must-revalidate',
  Vary: 'Cookie',
}

function parseNonNegativeInteger(value: string | null, name: string) {
  if (value === null) return null
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is too large`)
  return parsed
}

function contentResponse(request: NextRequest, payload: unknown) {
  const body = JSON.stringify(payload)
  const etag = `"${createHash('sha256').update(body).digest('base64url')}"`
  const headers = { ...CONTENT_HEADERS, ETag: etag }

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers })
  }

  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedDbUser(request)

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  }

  try {
    const after = parseNonNegativeInteger(request.nextUrl.searchParams.get('after'), 'after')

    if (after !== null) {
      return contentResponse(request, {
        items: getPublishedChangelogsAfter(after),
        nextCursor: null,
      })
    }

    const cursor = parseNonNegativeInteger(request.nextUrl.searchParams.get('cursor'), 'cursor')
    const requestedLimit = parseNonNegativeInteger(request.nextUrl.searchParams.get('limit'), 'limit') ?? 20
    const limit = Math.min(Math.max(requestedLimit, 1), 50)

    return contentResponse(request, getPublishedChangelogPage(cursor, limit))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid changelog request'
    return NextResponse.json(
      { error: message },
      { status: 400, headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  }
}
