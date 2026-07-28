import 'server-only'

import {
  ATTENDANCE_ROUTE_SETTING_KEY,
  canRoleAccessAttendance,
} from './featureAccess'
import { supabaseAdmin } from './supabaseAdmin'

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

export async function canUserAccessAttendance(role: string | null | undefined) {
  // Admin access must not depend on either the flag value or settings-table
  // availability.
  if (role === 'Admin') {
    return true
  }

  if (!role) {
    return false
  }

  return canRoleAccessAttendance(role, await getAttendanceRouteEnabled())
}
