import { supabaseAdmin } from './supabaseAdmin'
import {
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  normalizeStatsName,
  resolveStatsNameFromCandidates,
} from './statsIdentity'

type HistoricalStatsRow = {
  name: string | null
  supervisor: string | null
  created_at: string | null
}

export type HistoricalStatsTeamLeader = {
  name: string
  teamLeader: string
}

const HISTORY_TABLES = ['stats', 'stats_month'] as const
const HISTORY_CANDIDATE_LIMIT = 50

const newestFirst = (first: HistoricalStatsRow, second: HistoricalStatsRow) =>
  new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime()

const getUsableRows = (results: Array<{ data: unknown; error: { message: string } | null }>) => {
  const failedResult = results.find(result => result.error)
  if (failedResult?.error) throw failedResult.error

  return results
    .flatMap(result => (result.data || []) as HistoricalStatsRow[])
    .filter((row): row is HistoricalStatsRow & { name: string; supervisor: string } =>
      Boolean(row.name?.trim() && row.supervisor?.trim())
    )
    .sort(newestFirst)
}

/**
 * Finds the newest stored team-leader snapshot for an agent across weekly and
 * monthly Stats data. This is intentionally independent of the current roster.
 */
export async function getHistoricalStatsTeamLeader(
  identityNames: Array<string | null | undefined>
): Promise<HistoricalStatsTeamLeader | null> {
  for (const identityName of getUniqueStatsIdentityNames(identityNames)) {
    const exactRows = getUsableRows(await Promise.all(HISTORY_TABLES.map(table =>
      supabaseAdmin
        .from(table)
        .select('name, supervisor, created_at')
        .ilike('name', identityName)
        .order('created_at', { ascending: false })
        .limit(1)
    )))

    const exactRow = exactRows[0]
    if (exactRow) {
      return {
        name: exactRow.name.trim(),
        teamLeader: exactRow.supervisor.trim(),
      }
    }

    const fragments = getStatsNameSearchFragments(identityName)
    if (fragments.length === 0) continue

    const candidateRows = getUsableRows(await Promise.all(
      HISTORY_TABLES.flatMap(table => fragments.map(fragment =>
        supabaseAdmin
          .from(table)
          .select('name, supervisor, created_at')
          .ilike('name', `%${fragment}%`)
          .order('created_at', { ascending: false })
          .limit(HISTORY_CANDIDATE_LIMIT)
      ))
    ))
    const candidateNames = Array.from(new Set(candidateRows.map(row => row.name.trim())))
    const resolvedName = resolveStatsNameFromCandidates(candidateNames, [identityName])

    if (resolvedName) {
      const normalizedResolvedName = normalizeStatsName(resolvedName)
      const resolvedRow = candidateRows.find(row =>
        normalizeStatsName(row.name) === normalizedResolvedName
      )

      if (resolvedRow) {
        return {
          name: resolvedRow.name.trim(),
          teamLeader: resolvedRow.supervisor.trim(),
        }
      }
    }
  }

  return null
}
