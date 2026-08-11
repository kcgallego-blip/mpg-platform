import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_PAGE_SIZE = 50
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

const parsePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: noStoreHeaders })
    }

    const shiftDate = request.nextUrl.searchParams.get('shiftDate') || ''
    const agent = (request.nextUrl.searchParams.get('agent') || '').trim()
    const status = request.nextUrl.searchParams.get('status') || 'All'
    const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1)
    const pageSize = Math.min(parsePositiveInteger(request.nextUrl.searchParams.get('pageSize'), 25), MAX_PAGE_SIZE)

    if (!DATE_KEY_PATTERN.test(shiftDate) || !agent) {
      return NextResponse.json({ error: 'A valid shift date and agent are required' }, { status: 400, headers: noStoreHeaders })
    }
    if (user.role?.trim().toLowerCase() === 'agent' && user.email.toLowerCase() !== agent.toLowerCase()) {
      return NextResponse.json({ error: 'Productivity detail access denied' }, { status: 403, headers: noStoreHeaders })
    }

    const offset = (page - 1) * pageSize
    let query = supabaseAdmin
      .from('tph')
      .select('ticket_num, status', { count: 'exact' })
      .eq('shift_date', shiftDate)
      .eq('agent', agent)
      .order('ticket_num', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (status !== 'All') query = query.ilike('status', status)
    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ tickets: data || [], total: count || 0, page, pageSize }, { headers: noStoreHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load productivity tickets'
    return NextResponse.json({ error: message }, { status: 500, headers: noStoreHeaders })
  }
}
