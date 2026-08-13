export const STATS_NAME_MATCH_THRESHOLD = 60
const STATS_NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

export const normalizeStatsName = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const getStatsNameTokens = (value: string | null | undefined) =>
  Array.from(new Set(normalizeStatsName(value).split(/\s+/).filter(Boolean)))

const isWithinOneEdit = (left: string, right: string) => {
  if (left === right) return true
  if (Math.abs(left.length - right.length) > 1) return false

  if (left.length === right.length) {
    let differences = 0
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index] && ++differences > 1) return false
    }
    return true
  }

  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left]
  let shorterIndex = 0
  let longerIndex = 0
  let differences = 0

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1
      longerIndex += 1
      continue
    }

    differences += 1
    longerIndex += 1
    if (differences > 1) return false
  }

  return true
}

export const getStatsNameMatchScore = (
  statsName: string | null | undefined,
  identityName: string | null | undefined
) => {
  const normalizedStatsName = normalizeStatsName(statsName)
  const normalizedIdentityName = normalizeStatsName(identityName)
  const identityTokens = getStatsNameTokens(identityName)
  const statsTokens = getStatsNameTokens(statsName)

  if (!normalizedStatsName || !normalizedIdentityName || identityTokens.length === 0 || statsTokens.length === 0) {
    return 0
  }

  if (normalizedStatsName === normalizedIdentityName) return 100
  if (normalizedStatsName.includes(normalizedIdentityName) || normalizedIdentityName.includes(normalizedStatsName)) return 90

  const statsTokenSet = new Set(statsTokens)
  const identityTokenSet = new Set(identityTokens)
  const matchedIdentityTokens = identityTokens.filter(token => statsTokenSet.has(token)).length
  const matchedStatsTokens = statsTokens.filter(token => identityTokenSet.has(token)).length
  const firstToken = identityTokens[0]
  const lastToken = identityTokens[identityTokens.length - 1]

  if (
    (firstToken && lastToken && statsTokenSet.has(firstToken) && statsTokenSet.has(lastToken)) ||
    matchedIdentityTokens === identityTokens.length ||
    matchedStatsTokens === statsTokens.length
  ) {
    return 85
  }

  const meaningfulIdentityTokens = identityTokens.filter(token => !STATS_NAME_SUFFIXES.has(token))
  const firstMeaningfulToken = meaningfulIdentityTokens[0]
  const lastMeaningfulToken = meaningfulIdentityTokens[meaningfulIdentityTokens.length - 1]
  const hasNearStatsToken = (token: string | undefined) => Boolean(
    token && statsTokens.some(statsToken => statsToken !== token && isWithinOneEdit(statsToken, token))
  )

  if (
    firstMeaningfulToken &&
    lastMeaningfulToken &&
    firstMeaningfulToken !== lastMeaningfulToken &&
    (
      (statsTokenSet.has(firstMeaningfulToken) && hasNearStatsToken(lastMeaningfulToken)) ||
      (statsTokenSet.has(lastMeaningfulToken) && hasNearStatsToken(firstMeaningfulToken))
    )
  ) {
    return 80
  }

  if (
    matchedIdentityTokens >= 2 &&
    ((firstToken && statsTokenSet.has(firstToken)) || (lastToken && statsTokenSet.has(lastToken)))
  ) {
    return 70
  }

  if (matchedIdentityTokens >= Math.ceil(identityTokens.length * 0.6)) return 60

  return 0
}

export const getUniqueStatsIdentityNames = (
  names: Array<string | null | undefined>
) => {
  const seen = new Set<string>()

  return names.reduce<string[]>((identities, name) => {
    const trimmedName = name?.trim()
    const normalizedName = normalizeStatsName(trimmedName)

    if (trimmedName && normalizedName && !seen.has(normalizedName)) {
      seen.add(normalizedName)
      identities.push(trimmedName)
    }

    return identities
  }, [])
}

export const getStatsNameAnchorTokens = (identityName: string) => {
  const identityTokens = getStatsNameTokens(identityName)
  const commaIndex = identityName.indexOf(',')
  const surnameTokens = commaIndex >= 0 ? getStatsNameTokens(identityName.slice(0, commaIndex)) : []
  const givenNameTokens = commaIndex >= 0 ? getStatsNameTokens(identityName.slice(commaIndex + 1)) : []
  const lastNameToken = commaIndex >= 0
    ? surnameTokens[surnameTokens.length - 1]
    : [...identityTokens].reverse().find(token => !STATS_NAME_SUFFIXES.has(token))
  const firstNameToken = commaIndex >= 0 ? givenNameTokens[0] : identityTokens[0]

  return Array.from(new Set([firstNameToken, lastNameToken].filter(Boolean))) as string[]
}

export const getStatsNameSearchFragments = (identityName: string) => Array.from(new Set(
  getStatsNameAnchorTokens(identityName).flatMap(token => [
    token,
    ...(token.length >= 4
      ? [`${token.slice(0, Math.min(3, token.length - 2))}%${token.slice(-1)}`]
      : []),
    ...(token.length >= 5 ? [token.slice(0, 3), token.slice(-3)] : []),
  ])
))

const selectBestStatsName = (candidates: string[], identityName: string) => {
  let bestMatch: string | null = null
  let bestScore = 0
  let hasAmbiguousBestMatch = false

  candidates.forEach(candidate => {
    const score = getStatsNameMatchScore(candidate, identityName)

    if (score > bestScore) {
      bestMatch = candidate
      bestScore = score
      hasAmbiguousBestMatch = false
    } else if (
      score === bestScore &&
      score >= STATS_NAME_MATCH_THRESHOLD &&
      candidate !== bestMatch
    ) {
      hasAmbiguousBestMatch = true
    }
  })

  return bestScore >= STATS_NAME_MATCH_THRESHOLD && !hasAmbiguousBestMatch
    ? bestMatch
    : null
}

export const resolveStatsNameFromCandidates = (
  candidates: string[],
  identityNames: string[]
) => {
  for (const identityName of getUniqueStatsIdentityNames(identityNames)) {
    const match = selectBestStatsName(candidates, identityName)
    if (match) return match
  }

  return null
}

export const resolveRosterScopedAgentNames = (
  candidates: string[],
  identityNames: string[],
  rosterNames: string[]
) => {
  const matchingCandidates = candidates.filter(candidate =>
    identityNames.some(identityName =>
      getStatsNameMatchScore(candidate, identityName) >= STATS_NAME_MATCH_THRESHOLD
    )
  )

  for (const identityName of getUniqueStatsIdentityNames(identityNames)) {
    const identityCandidates = matchingCandidates.filter(candidate =>
      getStatsNameMatchScore(candidate, identityName) >= STATS_NAME_MATCH_THRESHOLD
    )
    const targetRosterName = resolveStatsNameFromCandidates(rosterNames, [identityName])

    if (!targetRosterName) {
      const resolvedName = resolveStatsNameFromCandidates(identityCandidates, [identityName])
      if (resolvedName) return [resolvedName]
      continue
    }

    const normalizedTargetRosterName = normalizeStatsName(targetRosterName)
    const safeAliases = identityCandidates.filter(candidate => {
      const scoredRosterNames = rosterNames.map(name => ({
        name,
        score: getStatsNameMatchScore(candidate, name),
      }))
      const bestScore = Math.max(0, ...scoredRosterNames.map(match => match.score))
      const bestMatches = scoredRosterNames.filter(match => match.score === bestScore)

      return bestScore >= STATS_NAME_MATCH_THRESHOLD &&
        bestMatches.length === 1 &&
        normalizeStatsName(bestMatches[0].name) === normalizedTargetRosterName
    })

    if (safeAliases.length > 0) return safeAliases
  }

  return []
}

export const getAgentStatsFallbackPeriod = (
  selectedPeriod: number,
  availablePeriods: number[],
  hasStats: boolean
) => {
  if (hasStats || availablePeriods.length === 0 || availablePeriods.includes(selectedPeriod)) {
    return null
  }

  return Math.max(...availablePeriods)
}
