export const HOME_ROUTE = '/home'
export const AGENT_ROUTE = '/agent'
export const STAFFING_ROUTE = '/staffing'

export function getPostLoginRoute(role: string | null | undefined) {
  return role?.trim().toLowerCase() === 'agent' ? HOME_ROUTE : STAFFING_ROUTE
}
