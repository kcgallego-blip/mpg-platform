const ATTENDANCE_MANAGEMENT_ROLES = new Set(['admin', 'manager', 'operations manager', 'supervisor', 'team leader'])

export const normalizeAttendanceRole = (role: string | null | undefined) => role?.trim().toLowerCase() || ''

export const canManageAttendance = (role: string | null | undefined) =>
  ATTENDANCE_MANAGEMENT_ROLES.has(normalizeAttendanceRole(role))

const NON_AGENT_ROSTER_ROLES = new Set([
  'admin',
  'manager',
  'operations manager',
  'supervisor',
  'team leader',
  'it',
])

/** The roster Position field contains channels such as Phone, Email, and Chat. */
export const isAttendanceRosterRole = (role: string | null | undefined) => {
  const normalized = normalizeAttendanceRole(role)
  return Boolean(normalized) && !NON_AGENT_ROSTER_ROLES.has(normalized)
}
