export const AGENT_ROUTE = '/agent'
export const STAFFING_ROUTE = '/staffing'

export function getPostLoginRoute(role: string | null | undefined) {
  return role?.trim().toLowerCase() === 'agent' ? AGENT_ROUTE : STAFFING_ROUTE
}
