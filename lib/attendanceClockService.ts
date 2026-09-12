import 'server-only'

import type { AttendanceNetworkStatus, OvertimeReviewStatus, RosterAttendanceAgent } from './attendance'
import { addDateKeyDays, getDefaultShiftDate, getEasternWallClockTimestamp, getOperationalCalendarDate, getPhilippineWallClockTimestamp, normalizeEmail } from './attendance'
import { chooseCurrentClockDay, getClockActionState, getSelfServiceOtReview, type AgentClockState, type ClockAction, type ClockSurface } from './attendanceClock'
import { getAttendanceTiming } from './attendanceManagement'
import { loadAttendanceRoster, loadResolvedAttendance } from './attendanceService'
import { supabaseAdmin } from './supabaseAdmin'

const db = supabaseAdmin as any

export type ClockPolicyAgent = RosterAttendanceAgent & { selfServiceEnabled: boolean; isWfh: boolean }
export type OfficeNetwork = { id?: string; label: string; network: string; updatedBy?: string; updatedAt?: string }

const missingMigration = (error: any) => error?.code === '42P01' || /attendance_clock_agent_policy|attendance_office_networks|clock_attendance_self_service/i.test(error?.message || '')
export const isClockMigrationMissing = missingMigration
export const isPhilippineClockMigrationMissing = (error: any) => /clock_attendance_self_service_manila/i.test(error?.message || '')

export const loadClockPolicies = async () => {
  const { data, error } = await db.from('attendance_clock_agent_policy').select('agent_email, self_service_enabled, is_wfh, updated_by, updated_at')
  if (error) throw error
  return (data || []) as Array<{ agent_email: string; self_service_enabled: boolean; is_wfh: boolean; updated_by: string; updated_at: string }>
}

export const getClockPolicy = async (email: string) => {
  const { data, error } = await db.from('attendance_clock_agent_policy').select('agent_email, self_service_enabled, is_wfh, updated_by, updated_at').eq('agent_email', normalizeEmail(email)).maybeSingle()
  if (error) throw error
  return data as { agent_email: string; self_service_enabled: boolean; is_wfh: boolean; updated_by: string; updated_at: string } | null
}

export const loadClockPolicyRoster = async (): Promise<ClockPolicyAgent[]> => {
  const [roster, policies] = await Promise.all([loadAttendanceRoster(), loadClockPolicies()])
  const byEmail = new Map(policies.map((row) => [normalizeEmail(row.agent_email), row]))
  return roster.map((agent) => ({
    ...agent,
    selfServiceEnabled: Boolean(byEmail.get(agent.email)?.self_service_enabled),
    isWfh: Boolean(byEmail.get(agent.email)?.is_wfh),
  }))
}

export const loadOfficeNetworks = async (): Promise<OfficeNetwork[]> => {
  const { data, error } = await db.from('attendance_office_networks').select('id, label, network, updated_by, updated_at').order('label')
  if (error) throw error
  return (data || []).map((row: any) => ({ id: row.id, label: row.label, network: row.network, updatedBy: row.updated_by, updatedAt: row.updated_at }))
}

export const replaceClockPilot = async (emails: string[], actor: string) => {
  const { data, error } = await db.rpc('replace_attendance_clock_pilot', { p_agent_emails: emails, p_actor: actor })
  if (error) throw error
  return Number(data || 0)
}

export const replaceClockWfh = async (emails: string[], actor: string) => {
  const { data, error } = await db.rpc('replace_attendance_clock_wfh', { p_agent_emails: emails, p_actor: actor })
  if (error) throw error
  return Number(data || 0)
}

export const replaceOfficeNetworks = async (networks: OfficeNetwork[], actor: string) => {
  const { data, error } = await db.rpc('replace_attendance_office_networks', { p_entries: networks, p_actor: actor })
  if (error) throw error
  return Number(data || 0)
}

export const classifyClockNetwork = async (ip: string | null, isWfh: boolean): Promise<AttendanceNetworkStatus> => {
  const { data, error } = await db.rpc('classify_attendance_network', { p_ip: ip, p_is_wfh: isWfh })
  if (error) throw error
  return data as AttendanceNetworkStatus
}

const buildClockState = async (agent: RosterAttendanceAgent, enabled: boolean, now: Date, networkStatus: AttendanceNetworkStatus | null): Promise<AgentClockState> => {
  const easternTimestamp = getEasternWallClockTimestamp(now)
  const currentShiftDate = getDefaultShiftDate(now)
  const from = addDateKeyDays(currentShiftDate, -1)
  const to = addDateKeyDays(currentShiftDate, 1)
  const resolved = await loadResolvedAttendance({ from, to, roster: [agent], currentShiftDate, currentTimestamp: easternTimestamp })
  const baseDay = resolved.days.find((day) => day.shiftDate === currentShiftDate)
  const operationalDate = getOperationalCalendarDate(currentShiftDate, baseDay?.shiftGroup || agent.shiftGroup)
  const target = chooseCurrentClockDay(resolved.days, easternTimestamp, operationalDate)
  const actionState = getClockActionState(target.day, target.staleOpen)
  const day = target.day
  return {
    enabled,
    serverTimestamp: getPhilippineWallClockTimestamp(now),
    shiftDate: day?.shiftDate || null,
    status: day?.status || 'Unavailable',
    shiftGroup: day?.shiftGroup || null,
    startShift: day?.startShift || '',
    endShift: day?.endShift || '',
    timeIn: day?.timeIn || null,
    timeOut: day?.timeOut || null,
    isRdot: Boolean(day && (day.status === 'Day Off' || day.status.startsWith('RDOT'))),
    action: enabled ? actionState.action : null,
    actionLabel: enabled ? actionState.actionLabel : null,
    blockedReason: enabled ? actionState.blockedReason : 'Self-service clocking is not enabled for your account.',
    networkStatus,
    preShiftOtReview: day?.preShiftOtReview || 'not_required',
    postShiftOtReview: day?.postShiftOtReview || 'not_required',
    preShiftOtMinutes: day?.preShiftOtMinutes || 0,
    postShiftOtMinutes: day?.postShiftOtMinutes || 0,
    lateMinutes: day?.lateMinutes || 0,
    undertimeMinutes: day?.undertimeMinutes || 0,
  }
}

const buildDisabledClockState = (now: Date): AgentClockState => ({
  enabled: false,
  serverTimestamp: getPhilippineWallClockTimestamp(now),
  shiftDate: null,
  status: 'Unavailable',
  shiftGroup: null,
  startShift: '',
  endShift: '',
  timeIn: null,
  timeOut: null,
  isRdot: false,
  action: null,
  actionLabel: null,
  blockedReason: 'Self-service clocking is not enabled for your account.',
  networkStatus: null,
  preShiftOtReview: 'not_required',
  postShiftOtReview: 'not_required',
  preShiftOtMinutes: 0,
  postShiftOtMinutes: 0,
  lateMinutes: 0,
  undertimeMinutes: 0,
})

export const loadAgentClockState = async (email: string, ip: string | null, now = new Date()) => {
  const policy = await getClockPolicy(email)
  if (!policy?.self_service_enabled) {
    return { agent: null, policy, state: buildDisabledClockState(now) }
  }
  const roster = await loadAttendanceRoster()
  const agent = roster.find((entry) => entry.email === normalizeEmail(email))
  if (!agent) throw new Error('Your account is not linked to an active roster email.')
  const networkStatus = await classifyClockNetwork(ip, Boolean(policy.is_wfh))
  return { agent, policy, state: await buildClockState(agent, true, now, networkStatus) }
}

export const performAgentClock = async ({ email, action, surface, requestId, ip, userAgent, now = new Date() }: {
  email: string; action: ClockAction; surface: ClockSurface; requestId: string; ip: string | null; userAgent: string; now?: Date
}) => {
  const context = await loadAgentClockState(email, ip, now)
  if (!context.state.enabled) throw Object.assign(new Error('Self-service clocking is not enabled for your account.'), { status: 403 })
  if (!context.agent) throw Object.assign(new Error('Your account is not linked to an active roster email.'), { status: 409 })
  if (!context.state.shiftDate || context.state.action !== action) throw Object.assign(new Error(context.state.blockedReason || 'Attendance changed. Refresh before clocking.'), { code: '40001' })
  const philippineTimestamp = getPhilippineWallClockTimestamp(now)
  const timing = getAttendanceTiming({
    shiftDate: context.state.shiftDate,
    startShift: context.state.startShift,
    endShift: context.state.endShift,
    timeIn: action === 'time_in' ? philippineTimestamp : context.state.timeIn,
    timeOut: action === 'time_out' ? philippineTimestamp : context.state.timeOut,
  })
  const review: OvertimeReviewStatus = getSelfServiceOtReview(
    action === 'time_in' ? timing.preShiftOtMinutes : timing.postShiftOtMinutes,
    context.state.isRdot,
  )
  const { error } = await db.rpc('clock_attendance_self_service_manila', {
    p_agent_email: context.agent.email,
    p_shift_date: context.state.shiftDate,
    p_action: action,
    p_surface: surface,
    p_request_id: requestId,
    p_recorded_at: now.toISOString(),
    p_ip: ip,
    p_user_agent: userAgent.slice(0, 512),
    p_network_status: context.state.networkStatus,
    p_ot_review: review,
  })
  if (error) throw error
  return (await loadAgentClockState(email, ip, now)).state
}

export const reviewOvertime = async (args: { email: string; shiftDate: string; field: 'pre_shift' | 'post_shift'; decision: 'approve' | 'reject'; actor: string; expectedUpdatedAt: string | null }) => {
  const { data, error } = await db.rpc('review_attendance_overtime', {
    p_agent_email: args.email, p_shift_date: args.shiftDate, p_review_field: args.field,
    p_decision: args.decision, p_actor: args.actor, p_expected_updated_at: args.expectedUpdatedAt,
  })
  if (error) throw error
  return data
}
