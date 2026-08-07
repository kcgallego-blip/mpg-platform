import 'server-only'

import { supabaseAdmin } from './supabaseAdmin'
import {
  ProductivityReport,
  ProductivityTicketRow,
  aggregateProductivityReport,
} from './productivityReport'
import { normalizeNameForMatch } from './tphProductivity'

type UserNameRow = {
  email: string
  name: string | null
}

type TeamAgentRow = {
  name: string
}

const PAGE_SIZE = 1000

const getTicketRows = async (shiftDate: string) => {
  const rows: ProductivityTicketRow[] = []

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('tph')
      .select('ticket_num, agent, status, created_at, shift_date')
      .eq('shift_date', shiftDate)
      .not('agent', 'is', null)
      .order('agent', { ascending: true })
      .order('created_at', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)

    if (error) throw new Error(`Unable to query TPH rows: ${error.message}`)

    const page = (data || []) as ProductivityTicketRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return rows
}

const getNamesByEmail = async (emails: string[]) => {
  const names = new Map<string, string>()

  for (let start = 0; start < emails.length; start += PAGE_SIZE) {
    const batch = emails.slice(start, start + PAGE_SIZE)
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .in('email', batch)

    if (error) throw new Error(`Unable to join user names: ${error.message}`)

    ;((data || []) as UserNameRow[]).forEach((user) => {
      if (user.name?.trim()) names.set(user.email, user.name.trim())
    })
  }

  return names
}

export const getProductivityReport = async ({
  shiftDate,
  requesterRole,
  requesterName,
}: {
  shiftDate: string
  requesterRole: string
  requesterName: string
}): Promise<ProductivityReport> => {
  const allTickets = await getTicketRows(shiftDate)
  const emails = Array.from(
    new Set(
      allTickets
        .map((ticket) => ticket.agent?.trim())
        .filter((email): email is string => Boolean(email))
    )
  )
  const namesByEmail = await getNamesByEmail(emails)
  let scopedTickets = allTickets
  let scopeLabel = 'All teams'

  if (requesterRole === 'Team Leader') {
    if (!requesterName.trim()) {
      throw new Error('The Team Leader account has no profile name for team scoping')
    }

    const { data, error } = await supabaseAdmin
      .from('agents')
      .select('name')
      .eq('team_leader', requesterName)

    if (error) throw new Error(`Unable to resolve Team Leader scope: ${error.message}`)

    const teamNames = new Set(
      ((data || []) as TeamAgentRow[])
        .map((agent) => normalizeNameForMatch(agent.name))
        .filter(Boolean)
    )

    scopedTickets = allTickets.filter((ticket) => {
      const email = ticket.agent?.trim() || ''
      const displayName = namesByEmail.get(email)
      return (
        teamNames.has(normalizeNameForMatch(displayName)) ||
        teamNames.has(normalizeNameForMatch(email))
      )
    })
    scopeLabel = `${requesterName}'s team`
  }

  return aggregateProductivityReport({
    shiftDate,
    tickets: scopedTickets,
    namesByEmail,
    scopeLabel,
  })
}
