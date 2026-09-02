import {
  getStatsNameMatchScore,
  STATS_NAME_MATCH_THRESHOLD,
  resolveStatsNameFromCandidates,
} from './statsIdentity.ts'

export type StatsRosterEntry = {
  name: string
  team_leader: string | null
}

export type StatsRosterResolution =
  | { status: 'matched'; rosterName: string; teamLeader: string }
  | { status: 'unmatched' }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'missing_team_leader'; rosterName: string }

export type StatsTeamLeaderResolution =
  | { status: 'matched'; teamLeader: string; source: 'roster' | 'history' | 'csv' }
  | { status: 'missing' }

export const resolveStatsRosterEntry = (
  csvName: string,
  roster: StatsRosterEntry[]
): StatsRosterResolution => {
  const resolvedName = resolveStatsNameFromCandidates(
    roster.map(agent => agent.name),
    [csvName]
  )

  if (resolvedName) {
    const matchedAgent = roster.find(agent => agent.name === resolvedName)
    const teamLeader = matchedAgent?.team_leader?.trim()

    return teamLeader
      ? { status: 'matched', rosterName: resolvedName, teamLeader }
      : { status: 'missing_team_leader', rosterName: resolvedName }
  }

  const scoredCandidates = roster
    .map(agent => ({
      name: agent.name,
      score: getStatsNameMatchScore(agent.name, csvName),
    }))
    .filter(candidate => candidate.score >= STATS_NAME_MATCH_THRESHOLD)
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
  const bestScore = scoredCandidates[0]?.score || 0
  const bestCandidates = scoredCandidates
    .filter(candidate => candidate.score === bestScore)
    .map(candidate => candidate.name)

  return bestCandidates.length > 1
    ? { status: 'ambiguous', candidates: bestCandidates }
    : { status: 'unmatched' }
}

export const resolveStatsTeamLeader = ({
  csvName,
  csvTeamLeader,
  roster,
  historicalTeamLeader,
}: {
  csvName: string
  csvTeamLeader: string | null | undefined
  roster: StatsRosterEntry[]
  historicalTeamLeader: string | null | undefined
}): StatsTeamLeaderResolution => {
  const rosterResolution = resolveStatsRosterEntry(csvName, roster)
  if (rosterResolution.status === 'matched') {
    return {
      status: 'matched',
      teamLeader: rosterResolution.teamLeader,
      source: 'roster',
    }
  }

  const storedTeamLeader = historicalTeamLeader?.trim()
  if (storedTeamLeader) {
    return { status: 'matched', teamLeader: storedTeamLeader, source: 'history' }
  }

  const uploadedTeamLeader = csvTeamLeader?.trim()
  if (uploadedTeamLeader) {
    return { status: 'matched', teamLeader: uploadedTeamLeader, source: 'csv' }
  }

  return { status: 'missing' }
}
