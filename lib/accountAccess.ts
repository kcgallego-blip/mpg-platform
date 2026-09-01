export function normalizeAccountRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() ?? ''
}

export function canViewAccounts(role: string | null | undefined) {
  const normalizedRole = normalizeAccountRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'it'
}

export function sessionVersionsMatch(
  cookieVersion: number | null | undefined,
  databaseVersion: number | null | undefined,
) {
  return (cookieVersion ?? 0) === (databaseVersion ?? 0)
}

export function canResetLocalPassword(
  actor: { email: string; role: string | null | undefined },
  target: { email: string; role: string | null | undefined; hasLocalPassword: boolean },
) {
  const actorEmail = actor.email.trim().toLowerCase()
  const targetEmail = target.email.trim().toLowerCase()
  const actorRole = normalizeAccountRole(actor.role)
  const targetRole = normalizeAccountRole(target.role)

  if (!target.hasLocalPassword || actorEmail === targetEmail) return false
  if (actorRole === 'admin') return true
  return actorRole === 'it' && targetRole !== 'admin'
}
