import { NextRequest, NextResponse } from 'next/server'
import { isValidPublishedChangelogSequence } from '@/lib/changelogServer'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const body = await request.json().catch(() => null) as { sequence?: unknown } | null
    const sequence = body?.sequence

    if (
      typeof sequence !== 'number' ||
      !Number.isSafeInteger(sequence) ||
      sequence <= 0 ||
      !isValidPublishedChangelogSequence(sequence)
    ) {
      return NextResponse.json(
        { error: 'A valid published changelog sequence is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }

    const { data, error } = await supabaseAdmin.rpc('acknowledge_changelog', {
      p_user_email: user.email,
      p_sequence: sequence,
    })

    if (error) throw error

    return NextResponse.json(
      { lastSeenSequence: Number(data) },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error('Unable to acknowledge changelogs:', error)
    return NextResponse.json(
      { error: 'Unable to mark changelogs as read' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
