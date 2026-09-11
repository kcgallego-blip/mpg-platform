import 'server-only'

import {
  ATTENDANCE_ROUTE_SETTING_KEY,
  ATTENDANCE_ALWAYS_VISIBLE_LOCALLY,
  PRODUCTIVITY_REPORT_SETTING_KEY,
  canRoleAccessAttendance,
} from './featureAccess'
import { supabaseAdmin } from './supabaseAdmin'
import { canManageAttendance } from './attendanceAccess'
import { normalizeEmail } from './attendance'

export async function getAttendanceRouteEnabled() {
  const { data, error } = await supabaseAdmin
    .from('feature_settings')
    .select('enabled')
    .eq('key', ATTENDANCE_ROUTE_SETTING_KEY)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.enabled === true
}

export async function getProductivityReportEnabled() {
  const { data, error } = await supabaseAdmin
    .from('feature_settings')
    .select('enabled')
    .eq('key', PRODUCTIVITY_REPORT_SETTING_KEY)
    .maybeSingle()

  if (error) {
    throw error
  }

  // Preserve the report's existing availability until the setting is created.
  return data?.enabled !== false
}

export async function canUserAccessAttendance(role: string | null | undefined, email?: string | null) {
  // Admin access must not depend on either the flag value or settings-table
  // availability.
  if (role === 'Admin') {
    return true
  }

  if (!role) {
    return false
  }

  if (ATTENDANCE_ALWAYS_VISIBLE_LOCALLY) {
    return true
  }

  if (canRoleAccessAttendance(role, await getAttendanceRouteEnabled())) return true

  const db = supabaseAdmin as any
  try {
    if (role.trim().toLowerCase() === 'agent' && email) {
      const { data, error } = await db.from('attendance_clock_agent_policy')
        .select('self_service_enabled').eq('agent_email', normalizeEmail(email)).maybeSingle()
      if (error) throw error
      return data?.self_service_enabled === true
    }
    if (canManageAttendance(role)) {
      const { count, error } = await db.from('attendance_clock_agent_policy')
        .select('agent_email', { count: 'exact', head: true }).eq('self_service_enabled', true)
      if (error) throw error
      return Boolean(count)
    }
  } catch (error: any) {
    if (error?.code !== '42P01' && !/attendance_clock_agent_policy/i.test(error?.message || '')) throw error
  }
  return false
}
