const AGENT_INSIGHT_ROLES = new Set([
  'admin',
  'operations manager',
  'team leader',
  'supervisor',
  'manager',
])

export function normalizeAgentInsightRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() || ''
}

export function canAccessAgentInsight(role: string | null | undefined) {
  return AGENT_INSIGHT_ROLES.has(normalizeAgentInsightRole(role))
}
