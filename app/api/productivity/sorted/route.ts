import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabase } from '@/lib/supabase'
import {
  getStatusFilteredCounts,
  getTotalTicketCount,
  getTphDataSourceForShiftDate,
  normalizeNameForMatch,
  parseSummaryTickets,
} from '@/lib/tphProductivity'

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

type TeamAgentRow = {
  name: string
}

type TphSummaryRow = {
  shift_date: string
  agent: string
  tickets: string | null
  hourly_tickets: string | null
  created_at: string
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
  const dbUser = await getAuthenticatedDbUser(request)

  if (!dbUser || !dbUser.role) {
    return null
  }

  return {
    email: dbUser.email,
    name: dbUser.name || '',
    role: dbUser.role,
  }
}

const formatDuration = (durationMs: number) => {
  const totalMinutes = Math.floor(durationMs / (60 * 1000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `${hours}h ${minutes}m`
}

const getPhilippineDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)

  return new Date(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
    getPart('second')
  )
}

const getShiftDate = (date: Date) => {
  const phDate = getPhilippineDate(date)
  const shiftDate = new Date(phDate)

  if (phDate.getHours() < 19) {
    shiftDate.setDate(shiftDate.getDate() - 1)
  }

  return shiftDate
}

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

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

    const currentShiftDate = getDateKey(getShiftDate(new Date()))
    const dataSource = getTphDataSourceForShiftDate(shiftDate, currentShiftDate)

    if (dataSource === 'tph_summary') {
      const { data: summaryData, error: summaryError } = await supabase
        .from('tph_summary')
        .select('shift_date, agent, tickets, hourly_tickets, created_at')
        .eq('shift_date', shiftDate)
        .order('agent', { ascending: true })

      if (summaryError) throw summaryError

      const summariesByEmail = new Map<string, AgentSummary>()

      ;((summaryData || []) as TphSummaryRow[]).forEach((row) => {
        const statusCounts = getStatusFilteredCounts(parseSummaryTickets(row.tickets), status)

        const totalTickets = getTotalTicketCount(statusCounts)
        if (status !== 'All' && totalTickets === 0) return

        summariesByEmail.set(row.agent, {
          email: row.agent,
          name: getEmailFallbackName(row.agent),
          totalTickets,
          firstTicketTime: null,
          latestTicketTime: null,
          shiftDurationMs: 0,
        })
      })

      const emails = Array.from(summariesByEmail.keys())
      const namesByEmail = new Map<string, string>()

      if (emails.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('email, name')
          .in('email', emails)

        if (usersError) throw usersError

        ;((users || []) as UserNameRow[]).forEach((row) => {
          const name = row.name || getEmailFallbackName(row.email)
          namesByEmail.set(row.email, name)

          const summary = summariesByEmail.get(row.email)
          if (summary) {
            summary.name = name
          }
        })
      }

      let summaries = Array.from(summariesByEmail.values())

      if (user.role === 'Team Leader') {
        const { data: teamAgents, error: teamError } = await supabase
          .from('agents')
          .select('name')
          .eq('team_leader', user.name)

        if (teamError) throw teamError

        const teamNames = new Set(
          ((teamAgents || []) as TeamAgentRow[]).map((agent) => normalizeNameForMatch(agent.name))
        )

        summaries = summaries.filter((summary) =>
          teamNames.has(normalizeNameForMatch(namesByEmail.get(summary.email) || summary.name)) ||
          teamNames.has(normalizeNameForMatch(summary.email))
        )
      }

      summaries.sort((first, second) => {
        if (first.totalTickets !== second.totalTickets) {
          return first.totalTickets - second.totalTickets
        }

        return first.name.localeCompare(second.name)
      })

      return NextResponse.json({
        shiftDate,
        status,
        source: dataSource,
        agents: summaries.map((summary) => ({
          ...summary,
          shiftDuration: formatDuration(summary.shiftDurationMs),
        })),
      })
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

    const TPH_PAGE_SIZE = 1000
    const allTphRows: TphRow[] = []

    for (let start = 0; ; start += TPH_PAGE_SIZE) {
      const { data: tphRows, error: tphError } = await tphQuery.range(start, start + TPH_PAGE_SIZE - 1)

      if (tphError) throw tphError

      const pageRows = (tphRows || []) as TphRow[]
      allTphRows.push(...pageRows)

      if (!pageRows || pageRows.length < TPH_PAGE_SIZE) {
        break
      }
    }

    const rows = allTphRows
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

    let summariesForRole = Array.from(summariesByEmail.values())

    if (user.role === 'Team Leader') {
      const { data: teamAgents, error: teamError } = await supabase
        .from('agents')
        .select('name')
        .eq('team_leader', user.name)

      if (teamError) throw teamError

      const teamNames = new Set(
        ((teamAgents || []) as TeamAgentRow[]).map((agent) => normalizeNameForMatch(agent.name))
      )

      summariesForRole = summariesForRole.filter((summary) =>
        teamNames.has(normalizeNameForMatch(summary.name)) ||
        teamNames.has(normalizeNameForMatch(summary.email))
      )
    }

    const summaries = summariesForRole.map((summary) => {
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
      source: dataSource,
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
