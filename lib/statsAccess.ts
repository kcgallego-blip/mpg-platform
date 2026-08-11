const STATS_UPLOAD_ROLES = new Set([
  'admin',
  'manager',
  'operations manager',
  'supervisor',
  'team leader',
])

export function normalizeStatsRole(role: string | null | undefined): string {
  return role?.trim().toLowerCase() || ''
}

export function canUploadStats(role: string | null | undefined): boolean {
  return STATS_UPLOAD_ROLES.has(normalizeStatsRole(role))
}
