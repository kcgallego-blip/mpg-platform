import { NextRequest, NextResponse } from 'next/server'
import { getLatestPublishedChangelogSequence } from '@/lib/changelogServer'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    // Deliberately select one scalar column to keep every scheduled check tiny.
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('last_seen_changelog_sequence')
      .eq('email', user.email)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json(
        { error: 'Authenticated user not found' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const lastSeenSequence = Number(data.last_seen_changelog_sequence) || 0
    const latestPublishedSequence = getLatestPublishedChangelogSequence()

    return NextResponse.json(
      {
        lastSeenSequence,
        latestPublishedSequence,
        hasUnseen: latestPublishedSequence > lastSeenSequence,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error('Unable to check changelog status:', error)
    return NextResponse.json(
      { error: 'Unable to check changelog updates' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
