import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateSuggestion } from '@/lib/suggestions'

export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: noStoreHeaders }
      )
    }

    if (user.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Administrator access required' },
        { status: 403, headers: noStoreHeaders }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('suggestions')
      .select('agent, created_at, suggest')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(
      { suggestions: data || [] },
      { headers: noStoreHeaders }
    )
  } catch (error) {
    console.error('Error loading suggestions:', error)
    return NextResponse.json(
      { error: 'Unable to load suggestions' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: noStoreHeaders }
      )
    }

    if (user.role !== 'Agent') {
      return NextResponse.json(
        { error: 'Agent access required' },
        { status: 403, headers: noStoreHeaders }
      )
    }

    const body = await request.json().catch(() => null)
    const validation = validateSuggestion(body?.suggest)

    if (validation.error || !validation.value) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: noStoreHeaders }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('suggestions')
      .insert({
        agent: user.email,
        suggest: validation.value,
      })
      .select('agent, created_at, suggest')
      .single()

    if (error) throw error

    return NextResponse.json(
      { suggestion: data },
      { status: 201, headers: noStoreHeaders }
    )
  } catch (error) {
    console.error('Error submitting suggestion:', error)
    return NextResponse.json(
      { error: 'Unable to submit suggestion' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}
