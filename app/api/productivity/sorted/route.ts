import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type TphRow = {
  agent: string | null
  ticket_num: number
  status: string | null
  created_at: string
}

type UserNameRow = {
  email: string
  name: string | null
}

type AgentSummary = {
  email: string
  name: string
  totalTickets: number
  firstTicketTime: string | null
  latestTicketTime: string | null
  shiftDurationMs: number
}

const ALLOWED_ROLES = ['Admin', 'Supervisor', 'Operations Manager', 'Team Leader']
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const getEmailFallbackName = (email: string) => {
  const localPart = email.split('@')[0] || email
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || email
}

const getAuthenticatedUser = async (request: NextRequest) => {
  const authCookie = request.cookies.get('webex_auth')

  if (!authCookie) {
    return null
  }

  try {
    const userData = JSON.parse(authCookie.value)

    if (!userData?.email) {
      return null
    }

    const { data: dbUser, error } = await supabase
      .from('users')
      .select('role')
      .eq('email', userData.email)
      .single()

    if (error || !dbUser?.role) {
      return null
    }

    return {
      email: userData.email as string,
      role: dbUser.role as string,
    }
  } catch {
    return null
  }
}

const formatDuration = (durationMs: number) => {
  const totalMinutes = Math.floor(durationMs / (60 * 1000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const shiftDate = searchParams.get('shiftDate') || ''
    const status = searchParams.get('status') || 'All'

    if (!DATE_KEY_PATTERN.test(shiftDate)) {
      return NextResponse.json({ error: 'Invalid shift date' }, { status: 400 })
    }

    // Optimized for the composite index on (shift_date, agent, ticket_num):
    // filter by the leading shift_date column first, then read rows ordered by
    // agent and ticket_num so grouped aggregation is cheap on the backend.
    let tphQuery = supabase
      .from('tph')
      .select('agent, ticket_num, status, created_at')
      .eq('shift_date', shiftDate)
      .not('agent', 'is', null)
      .order('agent', { ascending: true })
      .order('ticket_num', { ascending: true })

    if (status !== 'All') {
      tphQuery = tphQuery.ilike('status', status)
    }

    const { data: tphRows, error: tphError } = await tphQuery

    if (tphError) throw tphError

    const rows = (tphRows || []) as TphRow[]
    const summariesByEmail = new Map<string, AgentSummary>()

    rows.forEach((row) => {
      if (!row.agent) return

      const createdAtTime = Date.parse(row.created_at)
      const existingSummary = summariesByEmail.get(row.agent)

      if (!existingSummary) {
        summariesByEmail.set(row.agent, {
          email: row.agent,
          name: getEmailFallbackName(row.agent),
          totalTickets: 1,
          firstTicketTime: row.created_at,
          latestTicketTime: row.created_at,
          shiftDurationMs: 0,
        })
        return
      }

      const firstTime = existingSummary.firstTicketTime
        ? Date.parse(existingSummary.firstTicketTime)
        : createdAtTime
      const latestTime = existingSummary.latestTicketTime
        ? Date.parse(existingSummary.latestTicketTime)
        : createdAtTime

      existingSummary.totalTickets += 1

      if (createdAtTime < firstTime) {
        existingSummary.firstTicketTime = row.created_at
      }

      if (createdAtTime > latestTime) {
        existingSummary.latestTicketTime = row.created_at
      }
    })

    const emails = Array.from(summariesByEmail.keys())

    if (emails.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('email, name')
        .in('email', emails)

      if (usersError) throw usersError

      ;((users || []) as UserNameRow[]).forEach((row) => {
        const summary = summariesByEmail.get(row.email)

        if (summary) {
          summary.name = row.name || getEmailFallbackName(row.email)
        }
      })
    }

    const summaries = Array.from(summariesByEmail.values()).map((summary) => {
      const firstTime = summary.firstTicketTime ? Date.parse(summary.firstTicketTime) : 0
      const latestTime = summary.latestTicketTime ? Date.parse(summary.latestTicketTime) : 0
      const shiftDurationMs = Math.max(latestTime - firstTime, 0)

      return {
        ...summary,
        shiftDurationMs,
        shiftDuration: formatDuration(shiftDurationMs),
      }
    })

    summaries.sort((first, second) => {
      if (first.totalTickets !== second.totalTickets) {
        return first.totalTickets - second.totalTickets
      }

      if (first.shiftDurationMs !== second.shiftDurationMs) {
        return second.shiftDurationMs - first.shiftDurationMs
      }

      return first.name.localeCompare(second.name)
    })

    return NextResponse.json({
      shiftDate,
      status,
      agents: summaries,
    })
  } catch (error: any) {
    console.error('Productivity sort error:', error)
    return NextResponse.json(
      { error: error.message || 'Unable to sort productivity data' },
      { status: 500 }
    )
  }
}
