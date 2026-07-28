export const ATTENDANCE_ROUTE_SETTING_KEY = 'attendance_route_enabled'

export function canRoleAccessAttendance(
  role: string | null | undefined,
  attendanceRouteEnabled: boolean
) {
  return role === 'Admin' || (Boolean(role) && attendanceRouteEnabled)
}
