import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
    if (!user.role?.trim() || user.role.trim().toLowerCase() === 'agent') {
      return NextResponse.json({ error: 'Ticket management access denied' }, { status: 403, headers: noStoreHeaders })
    }

    const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1)
    const pageSize = Math.min(parsePositiveInteger(request.nextUrl.searchParams.get('pageSize'), 12), MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize
    const { data, error, count } = await supabaseAdmin
      .from('five9')
      .select('id, name, start_time, end_time, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw error

    return NextResponse.json({
      records: data || [],
      total: count || 0,
      page,
      pageSize,
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('Unable to load Five9 page:', error)
    return NextResponse.json({ error: 'Unable to load Five9 records' }, { status: 500, headers: noStoreHeaders })
  }
}
