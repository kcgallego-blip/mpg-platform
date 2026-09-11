import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { getOrGenerateHomeMessage } from '@/lib/homeMessageService'
import { getDailyFallbackHomeMessage, getManilaDateKey } from '@/lib/homeInsights'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  let authenticatedName: string | null = null
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
    authenticatedName = user.name

    const result = await getOrGenerateHomeMessage(user)
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (error) {
    console.error('Home message API error:', error)
    if (authenticatedName === null) {
      return NextResponse.json(
        { error: 'Failed to load your home message' },
        { status: 500, headers: noStoreHeaders }
      )
    }
    return NextResponse.json(
      {
        message: getDailyFallbackHomeMessage(authenticatedName, getManilaDateKey()),
        generatedAt: new Date().toISOString(),
        canRegenerate: false,
      },
      { headers: noStoreHeaders }
    )
  }
}
