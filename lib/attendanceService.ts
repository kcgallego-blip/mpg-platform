import 'server-only'

import {
  AttendanceRecord,
  AttendanceDayOutcome,
  AttendanceOutcomeValue,
  OvertimeReviewStatus,
  ResolvedAttendanceDay,
  RosterAttendanceAgent,
  ScheduleException,
  ScheduleExceptionKind,
  ScheduleSnapshotEntry,
  ShiftGroup,
  addDateKeyDays,
  enumerateDateKeys,
  getOperationalCalendarDate,
  getEasternWallClockTimestamp,
  inferShiftGroup,
  normalizeEmail,
} from './attendance'
import {
  ScheduleVersion,
  buildScheduleRevertChanges,
  findEffectiveSchedule,
  resolveAttendanceDay,
} from './attendanceManagement'
import { supabaseAdmin } from './supabaseAdmin'
import { isAttendanceRosterRole } from './attendanceAccess'

type AgentRow = {
  name: string
  email: string | null
  team_leader: string | null
  role: string | null
  off_1: string | null
  off_2: string | null
  start_shift: string | null
  end_shift: string | null
}

export class AttendanceConfigurationError extends Error {}

export const loadAttendanceRoster = async (): Promise<RosterAttendanceAgent[]> => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('name, email, team_leader, role, off_1, off_2, start_shift, end_shift')
    .order('name', { ascending: true })
  if (error) throw error

  const agentRows = ((data || []) as AgentRow[]).filter(
    (row) => isAttendanceRosterRole(row.role)
  )
  const missingEmail = agentRows.filter((row) => !row.email?.trim())
  if (missingEmail.length) {
    throw new AttendanceConfigurationError(
      `Active Agent roster emails are required: ${missingEmail.map((row) => row.name).join(', ')}`
    )
  }

  const seen = new Map<string, string>()
  return agentRows.map((row) => {
    const email = normalizeEmail(row.email!)
    const previous = seen.get(email)
    if (previous) {
      throw new AttendanceConfigurationError(`Roster email ${email} is used by both ${previous} and ${row.name}.`)
    }
    seen.set(email, row.name)
    const startShift = row.start_shift || ''
    return {
      email,
      name: row.name,
      teamLeader: row.team_leader || '',
      startShift,
      endShift: row.end_shift || '',
      off1: row.off_1 || '',
      off2: row.off_2 || '',
      shiftGroup: inferShiftGroup(startShift),
    }
  })
}

export const loadTrackerOrder = async (roster: RosterAttendanceAgent[]) => {
  const { data, error } = await supabaseAdmin
    .from('attendance_tracker_order')
    .select('agent_email, position, updated_by, updated_at')
    .order('position', { ascending: true })
  if (error) throw error

  const rosterByEmail = new Map(roster.map((agent) => [agent.email, agent]))
  const rows = (data || []) as Array<{
    agent_email: string
    position: number
    updated_by: string
    updated_at: string
  }>
  const issues: string[] = []
  const orderedAgents: RosterAttendanceAgent[] = []
  const seen = new Set<string>()
  rows.forEach((row) => {
    const email = normalizeEmail(row.agent_email)
    const agent = rosterByEmail.get(email)
    if (!agent) issues.push(`Saved order contains an inactive or unknown email: ${email}`)
    else if (seen.has(email)) issues.push(`Saved order contains ${agent.name} more than once.`)
    else {
      seen.add(email)
      orderedAgents.push(agent)
    }
  })
  roster.forEach((agent) => {
    if (!seen.has(agent.email)) issues.push(`Saved order is missing ${agent.name}.`)
  })
  if (!rows.length) issues.push('Tracker order has not been saved yet.')

  return {
    ready: issues.length === 0,
    issues,
    agents: orderedAgents,
    updatedBy: rows[0]?.updated_by || null,
    updatedAt: rows[0]?.updated_at || null,
  }
}

const loadScheduleVersions = async (throughDate: string): Promise<ScheduleVersion[]> => {
  const { data: headers, error: headerError } = await supabaseAdmin
    .from('attendance_schedule_versions')
    .select('id, effective_from, created_at')
    .lte('effective_from', throughDate)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
  if (headerError) throw headerError
  if (!headers?.length) return []

  const ids = headers.map((header) => header.id)
  const { data: entries, error: entryError } = await supabaseAdmin
    .from('attendance_schedule_entries')
    .select('version_id, agent_email, agent_name, team_leader, start_shift, end_shift, off_1, off_2, shift_group')
    .in('version_id', ids)
  if (entryError) throw entryError

  const entriesByVersion = new Map<string, ScheduleSnapshotEntry[]>()
  ;(entries || []).forEach((row) => {
    const entry: ScheduleSnapshotEntry = {
      versionId: row.version_id,
      email: normalizeEmail(row.agent_email),
      name: row.agent_name,
      teamLeader: row.team_leader || '',
      startShift: row.start_shift || '',
      endShift: row.end_shift || '',
      off1: row.off_1 || '',
      off2: row.off_2 || '',
      shiftGroup: row.shift_group as ShiftGroup,
    }
    entriesByVersion.set(row.version_id, [...(entriesByVersion.get(row.version_id) || []), entry])
  })

  return headers.map((header) => ({
    id: header.id,
    effectiveFrom: header.effective_from,
    createdAt: header.created_at,
    entries: entriesByVersion.get(header.id) || [],
  }))
}

const loadExceptions = async (from: string, to: string, emails: string[]) => {
  if (!emails.length) return []
  const { data, error } = await supabaseAdmin
    .from('attendance_schedule_exceptions')
    .select('id, agent_email, shift_date, kind, start_shift, end_shift, note')
    .in('agent_email', emails)
    .gte('shift_date', from)
    .lte('shift_date', to)
  if (error) throw error
  return (data || []).map((row): ScheduleException => ({
    id: row.id,
    agentEmail: normalizeEmail(row.agent_email),
    shiftDate: row.shift_date,
    kind: row.kind as ScheduleExceptionKind,
    startShift: row.start_shift,
    endShift: row.end_shift,
    note: row.note,
  }))
}

export const loadAttendanceRecords = async (from: string, to: string, emails: string[]) => {
  if (!emails.length) return []
  const { data, error } = await supabaseAdmin
    .from('attendance')
    .select('agent, shift_date, time_in, time_out, pre_shift_ot_approved, post_shift_ot_approved, pre_shift_ot_review, post_shift_ot_review, source, updated_by, updated_at, import_id')
    .in('agent', emails)
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('shift_date', { ascending: true })
  if (error) throw error
  return (data || []) as AttendanceRecord[]
}

export const loadClockNetworkStatuses = async (days: ResolvedAttendanceDay[]) => {
  if (!days.length) return [] as Array<{ agentEmail: string; shiftDate: string; networkStatus: string }>
  const emails = [...new Set(days.map((day) => day.agent))]
  const dates = [...new Set(days.map((day) => day.shiftDate))]
  const db = supabaseAdmin as any
  const { data, error } = await db.from('attendance_clock_events')
    .select('agent_email, shift_date, network_status, recorded_at')
    .in('agent_email', emails).in('shift_date', dates).order('recorded_at', { ascending: false })
  if (error) {
    if (error.code === '42P01' || /attendance_clock_events/i.test(error.message || '')) return []
    throw error
  }
  const priority: Record<string, number> = { office: 0, wfh_exempt: 1, unconfigured: 2, unknown_ip_flagged: 3, offsite_flagged: 4 }
  const worstByDay = new Map<string, { agentEmail: string; shiftDate: string; networkStatus: string }>()
  for (const row of data || []) {
    const key = `${normalizeEmail(row.agent_email)}|${row.shift_date}`
    const current = worstByDay.get(key)
    if (!current || (priority[row.network_status] ?? 0) > (priority[current.networkStatus] ?? 0)) {
      worstByDay.set(key, { agentEmail: normalizeEmail(row.agent_email), shiftDate: row.shift_date, networkStatus: row.network_status })
    }
  }
  return [...worstByDay.values()]
}

export const loadAttendanceOutcomes = async (from: string, to: string, emails: string[]) => {
  if (!emails.length) return []
  const { data, error } = await supabaseAdmin
    .from('attendance_day_outcomes')
    .select('agent_email, shift_date, outcome, note, updated_by, updated_at')
    .in('agent_email', emails)
    .gte('shift_date', from)
    .lte('shift_date', to)
  if (error) throw error
  return (data || []).map((row): AttendanceDayOutcome => ({
    agentEmail: normalizeEmail(row.agent_email),
    shiftDate: row.shift_date,
    outcome: row.outcome as AttendanceOutcomeValue,
    note: row.note,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }))
}

export const loadResolvedAttendance = async ({
  from,
  to,
  roster,
  currentShiftDate,
  currentTimestamp = getEasternWallClockTimestamp(),
}: {
  from: string
  to: string
  roster: RosterAttendanceAgent[]
  currentShiftDate: string
  currentTimestamp?: string
}) => {
  const emails = roster.map((agent) => agent.email)
  const [attendance, versions, exceptions, outcomes] = await Promise.all([
    loadAttendanceRecords(from, to, emails),
    loadScheduleVersions(to),
    loadExceptions(from, to, emails),
    loadAttendanceOutcomes(from, to, emails),
  ])
  const attendanceMap = new Map(attendance.map((row) => [`${normalizeEmail(row.agent)}|${row.shift_date}`, row]))
  const exceptionMap = new Map(exceptions.map((row) => [`${row.agentEmail}|${row.shiftDate}`, row]))
  const outcomeMap = new Map(outcomes.map((row) => [`${row.agentEmail}|${row.shiftDate}`, row]))
  const dates = enumerateDateKeys(from, to)
  const days: ResolvedAttendanceDay[] = []

  roster.forEach((rosterAgent) => {
    dates.forEach((date) => {
      const version = findEffectiveSchedule(versions, date)
      const schedule = version?.entries.find((entry) => entry.email === rosterAgent.email)
      days.push(resolveAttendanceDay({
        rosterAgent,
        date,
        attendance: attendanceMap.get(`${rosterAgent.email}|${date}`),
        schedule,
        exception: exceptionMap.get(`${rosterAgent.email}|${date}`),
        outcome: outcomeMap.get(`${rosterAgent.email}|${date}`),
        currentShiftDate,
        currentTimestamp,
      }))
    })
  })
  return { days, attendance, versions, exceptions, outcomes }
}

export const loadOperationalAttendance = async ({
  shiftDate,
  roster,
  currentShiftDate,
}: {
  shiftDate: string
  roster: RosterAttendanceAgent[]
  currentShiftDate: string
}) => {
  const nextDate = addDateKeyDays(shiftDate, 1)
  const resolved = await loadResolvedAttendance({
    from: shiftDate,
    to: nextDate,
    roster,
    currentShiftDate,
  })
  const dayByKey = new Map(resolved.days.map((day) => [`${day.agent}|${day.shiftDate}`, day]))
  const days = roster.map((agent) => {
    const baseDay = dayByKey.get(`${agent.email}|${shiftDate}`)
    const calendarDate = getOperationalCalendarDate(shiftDate, baseDay?.shiftGroup || agent.shiftGroup)
    return dayByKey.get(`${agent.email}|${calendarDate}`)!
  }).filter(Boolean)
  const selectedKeys = new Set(days.map((day) => `${day.agent}|${day.shiftDate}`))
  const attendance = resolved.attendance.filter((row) => selectedKeys.has(`${normalizeEmail(row.agent)}|${row.shift_date}`))
  return { ...resolved, days, attendance }
}

export const loadScheduleEditor = async (effectiveFrom: string, roster: RosterAttendanceAgent[]) => {
  const versions = await loadScheduleVersions(effectiveFrom)
  const effective = findEffectiveSchedule(versions, effectiveFrom)
  const byEmail = new Map(effective?.entries.map((entry) => [entry.email, entry]) || [])
  return {
    entries: roster.map((agent) => byEmail.get(agent.email) || agent),
    basedOn: effective ? { id: effective.id, effectiveFrom: effective.effectiveFrom, createdAt: effective.createdAt } : null,
    history: versions.slice(0, 20).map((version) => ({ id: version.id, effectiveFrom: version.effectiveFrom, createdAt: version.createdAt })),
  }
}

export const prepareScheduleRevert = async (versionId: string, roster: RosterAttendanceAgent[]) => {
  const { data: selectedHeader, error: selectedError } = await supabaseAdmin
    .from('attendance_schedule_versions')
    .select('id, effective_from, created_at')
    .eq('id', versionId)
    .maybeSingle()
  if (selectedError) throw selectedError
  if (!selectedHeader) throw new Error('The selected schedule version was not found.')

  const versions = await loadScheduleVersions(selectedHeader.effective_from)
  const selectedIndex = versions.findIndex((version) => version.id === versionId)
  if (selectedIndex < 0) throw new Error('The selected schedule version could not be loaded.')
  const temporaryVersion = versions[selectedIndex]
  const previousVersion = versions[selectedIndex + 1]
  if (!previousVersion) throw new Error('This is the first saved schedule version, so there is no previous snapshot to restore.')

  return {
    source: { id: temporaryVersion.id, effectiveFrom: temporaryVersion.effectiveFrom, createdAt: temporaryVersion.createdAt },
    previous: { id: previousVersion.id, effectiveFrom: previousVersion.effectiveFrom, createdAt: previousVersion.createdAt },
    changes: buildScheduleRevertChanges(temporaryVersion, previousVersion, roster),
  }
}

export const replaceTrackerOrder = async (agents: RosterAttendanceAgent[], actor: string) => {
  const { data, error } = await supabaseAdmin.rpc('replace_attendance_tracker_order', {
    p_entries: agents.map((agent, index) => ({ agent_email: agent.email, position: index + 1 })),
    p_actor: actor,
  })
  if (error) throw error
  return Number(data || 0)
}

export const commitAttendanceRows = async ({ shiftDate, source, actor, rows, outcomes = [] }: {
  shiftDate: string
  source: 'google_form_paste' | 'manual'
  actor: string
  rows: Array<{
    agent_email: string
    shift_date?: string
    time_in: string | null
    time_out: string | null
    expected_updated_at: string | null
    pre_shift_ot_approved?: boolean
    post_shift_ot_approved?: boolean
    pre_shift_ot_review?: OvertimeReviewStatus
    post_shift_ot_review?: OvertimeReviewStatus
  }>
  outcomes?: Array<{ agent_email: string; shift_date: string; outcome: AttendanceOutcomeValue | null; note?: string }>
}) => {
  const { data, error } = await supabaseAdmin.rpc('commit_attendance_with_outcomes', {
    p_shift_date: shiftDate,
    p_source: source,
    p_actor: actor,
    p_rows: rows,
    p_outcomes: outcomes,
  })
  if (error) throw error
  return data
}

export const createScheduleVersion = async (effectiveFrom: string, note: string, entries: ScheduleSnapshotEntry[], actor: string) => {
  const { data, error } = await supabaseAdmin.rpc('create_attendance_schedule_version', {
    p_effective_from: effectiveFrom,
    p_note: note,
    p_actor: actor,
    p_entries: entries.map((entry) => ({
      agent_email: entry.email,
      agent_name: entry.name,
      team_leader: entry.teamLeader,
      start_shift: entry.startShift,
      end_shift: entry.endShift,
      off_1: entry.off1,
      off_2: entry.off2,
      shift_group: entry.shiftGroup,
    })),
  })
  if (error) throw error
  return data as string
}

export const upsertScheduleExceptions = async (entries: ScheduleException[], actor: string) => {
  const { data, error } = await supabaseAdmin.rpc('upsert_attendance_schedule_exceptions', {
    p_actor: actor,
    p_entries: entries.map((entry) => ({
      agent_email: entry.agentEmail,
      shift_date: entry.shiftDate,
      kind: entry.kind,
      start_shift: entry.startShift || '',
      end_shift: entry.endShift || '',
      note: entry.note || '',
    })),
  })
  if (error) throw error
  return Number(data || 0)
}
