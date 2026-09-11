import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import {
  getOrGenerateHomeMessage,
  HomeMessageConflictError,
} from '@/lib/homeMessageService'
import { HomeMessageGenerationError } from '@/lib/homeMessageGenerator'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: noStoreHeaders }
      )
    }

    if (user.role?.trim().toLowerCase() !== 'agent') {
      return NextResponse.json(
        { error: 'Home messages are currently available to Agents only' },
        { status: 403, headers: noStoreHeaders }
      )
    }

    const body = await request.json().catch(() => ({})) as { regenerate?: unknown }
    if (body.regenerate !== undefined && typeof body.regenerate !== 'boolean') {
      return NextResponse.json(
        { error: 'regenerate must be a boolean' },
        { status: 400, headers: noStoreHeaders }
      )
    }

    const result = await getOrGenerateHomeMessage(user, body.regenerate === true)
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof HomeMessageConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          ...error.current,
        },
        { status: 409, headers: noStoreHeaders }
      )
    }

    if (error instanceof HomeMessageGenerationError) {
      console.error(`Home message generation error (${error.reason}):`, error.message)
      return NextResponse.json(
        { error: 'Your AI message is temporarily unavailable' },
        { status: 503, headers: noStoreHeaders }
      )
    }

    console.error('Home message API error:', error)
    return NextResponse.json(
      { error: 'Failed to load your home message' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

