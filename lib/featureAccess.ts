export const ATTENDANCE_ROUTE_SETTING_KEY = 'attendance_route_enabled'
export const PRODUCTIVITY_REPORT_SETTING_KEY = 'productivity_report_enabled'

/** Local development keeps Attendance available while the production toggle remains unchanged. */
export const ATTENDANCE_ALWAYS_VISIBLE_LOCALLY =
  process.env.NODE_ENV === 'development'

export function canRoleAccessAttendance(
  role: string | null | undefined,
  attendanceRouteEnabled: boolean,
  alwaysVisible = false
) {
  return role === 'Admin' || (Boolean(role) && (attendanceRouteEnabled || alwaysVisible))
}
