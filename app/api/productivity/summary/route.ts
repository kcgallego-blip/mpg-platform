import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { calculateMetricsFromRawDuration } from '@/lib/tphProductivity'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

type BucketRow = {
  agent: string
  ticket_status: string
  hour_key: string
  ticket_count: number
  first_ticket_time: string
  latest_ticket_time: string
}

type AgentBucketSummary = {
  email: string
  name: string
  total: number
  statusCounts: Record<string, number>
  hourlyCounts: Record<string, number>
  firstTicketTime: string | null
  latestTicketTime: string | null
}

const getFallbackName = (email: string) => {
  const localPart = email.split('@')[0] || email
  return localPart.split(/[._-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: noStoreHeaders })
    }

    const shiftDate = request.nextUrl.searchParams.get('shiftDate') || ''
    const status = request.nextUrl.searchParams.get('status') || 'All'
    const requestedAgent = request.nextUrl.searchParams.get('agent')?.trim() || null
    const normalizedRole = user.role?.trim().toLowerCase() || ''
    const agent = normalizedRole === 'agent' ? user.email : requestedAgent
    if (!DATE_KEY_PATTERN.test(shiftDate)) {
      return NextResponse.json({ error: 'Invalid shift date' }, { status: 400, headers: noStoreHeaders })
    }

    const { data, error } = await supabaseAdmin.rpc('get_tph_productivity_buckets', {
      p_shift_date: shiftDate,
      p_status: status,
      p_agent: agent,
      p_team_leader: null,
    })

    if (error) throw new Error(`Productivity aggregation is unavailable: ${error.message}`)

    const summaries = new Map<string, AgentBucketSummary>()
    ;((data || []) as BucketRow[]).forEach((bucket) => {
      const count = Number(bucket.ticket_count) || 0
      const summary = summaries.get(bucket.agent) || {
        email: bucket.agent,
        name: getFallbackName(bucket.agent),
        total: 0,
        statusCounts: {},
        hourlyCounts: {},
        firstTicketTime: null,
        latestTicketTime: null,
      }

      summary.total += count
      summary.statusCounts[bucket.ticket_status] = (summary.statusCounts[bucket.ticket_status] || 0) + count
      summary.hourlyCounts[bucket.hour_key] = (summary.hourlyCounts[bucket.hour_key] || 0) + count
      if (!summary.firstTicketTime || Date.parse(bucket.first_ticket_time) < Date.parse(summary.firstTicketTime)) {
        summary.firstTicketTime = bucket.first_ticket_time
      }
      if (!summary.latestTicketTime || Date.parse(bucket.latest_ticket_time) > Date.parse(summary.latestTicketTime)) {
        summary.latestTicketTime = bucket.latest_ticket_time
      }
      summaries.set(bucket.agent, summary)
    })

    const emails = Array.from(summaries.keys())
    if (emails.length > 0) {
      const { data: users, error: usersError } = await supabaseAdmin
        .from('users')
        .select('email, name')
        .in('email', emails)

      if (usersError) throw usersError
      ;((users || []) as Array<{ email: string; name: string | null }>).forEach((dbUser) => {
        const summary = summaries.get(dbUser.email)
        if (summary) summary.name = dbUser.name || getFallbackName(dbUser.email)
      })
    }

    const agents = Array.from(summaries.values()).map((summary) => {
      const firstTime = summary.firstTicketTime ? Date.parse(summary.firstTicketTime) : Number.NaN
      const latestTime = summary.latestTicketTime ? Date.parse(summary.latestTicketTime) : Number.NaN
      const rawDurationMinutes = Number.isFinite(firstTime) && Number.isFinite(latestTime)
        ? Math.max(0, (latestTime - firstTime) / 60_000)
        : 0
      const metrics = calculateMetricsFromRawDuration(summary.total, rawDurationMinutes)

      return {
        ...summary,
        tphAverage: metrics.tph,
        shiftDuration: metrics.formattedNetDuration,
        shiftDurationMs: metrics.netDurationMinutes * 60_000,
        source: 'tph' as const,
      }
    })

    return NextResponse.json({ agents }, { headers: noStoreHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load productivity summary'
    return NextResponse.json({ error: message }, { status: 500, headers: noStoreHeaders })
  }
}
