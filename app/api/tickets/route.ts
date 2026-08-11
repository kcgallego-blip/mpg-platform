import { NextRequest, NextResponse } from 'next/server'
import { TICKET_LIST_COLUMNS } from '@/lib/dbColumns'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MAX_PAGE_SIZE = 50
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }
const statuses = ['Open', 'Pending', 'Solved'] as const

const parsePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

const canManageTickets = (role: string | null) =>
  Boolean(role?.trim()) && role?.trim().toLowerCase() !== 'agent'

const getSearchFilter = (value: string) => {
  const search = value.replace(/[(),]/g, ' ').trim().slice(0, 120)
  if (!search) return ''

  const filters = [
    `name.ilike.%${search}%`,
    `team_leader.ilike.%${search}%`,
    `category.ilike.%${search}%`,
    `concern.ilike.%${search}%`,
    `assisted_by.ilike.%${search}%`,
  ]

  if (/^\d+$/.test(search)) filters.push(`ticketid.eq.${Number(search)}`)
  return filters.join(',')
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: noStoreHeaders })
    }
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: 'Ticket management access denied' }, { status: 403, headers: noStoreHeaders })
    }

    const page = parsePositiveInteger(request.nextUrl.searchParams.get('page'), 1)
    const pageSize = Math.min(parsePositiveInteger(request.nextUrl.searchParams.get('pageSize'), 12), MAX_PAGE_SIZE)
    const status = request.nextUrl.searchParams.get('status') || 'Open'
    const dateFrom = request.nextUrl.searchParams.get('dateFrom') || ''
    const dateTo = request.nextUrl.searchParams.get('dateTo') || ''
    const searchFilter = getSearchFilter(request.nextUrl.searchParams.get('search') || '')
    const offset = (page - 1) * pageSize

    let query = supabaseAdmin
      .from('tickets')
      .select(TICKET_LIST_COLUMNS, { count: 'exact' })
      .order('date', { ascending: false, nullsFirst: false })
      .order('start_time', { ascending: false, nullsFirst: false })
      .order('ticketid', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status !== 'All') query = query.ilike('status', status)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)
    if (searchFilter) query = query.or(searchFilter)

    const countQueries = statuses.map((ticketStatus) =>
      supabaseAdmin
        .from('tickets')
        .select('ticketid', { count: 'exact', head: true })
        .ilike('status', ticketStatus)
    )
    const [listResult, ...countResults] = await Promise.all([query, ...countQueries])

    if (listResult.error) throw listResult.error

    return NextResponse.json({
      tickets: listResult.data || [],
      total: listResult.count || 0,
      page,
      pageSize,
      statusCounts: statuses.reduce<Record<string, number>>((counts, ticketStatus, index) => {
        counts[ticketStatus] = countResults[index]?.count || 0
        return counts
      }, {}),
    }, { headers: noStoreHeaders })
  } catch (error) {
    console.error('Unable to load ticket page:', error)
    return NextResponse.json({ error: 'Unable to load tickets' }, { status: 500, headers: noStoreHeaders })
  }
}
