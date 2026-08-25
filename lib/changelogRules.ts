import type { ChangelogPage, ChangelogRelease } from './changelog'

export function getPublishedChangelogs(
  releases: readonly ChangelogRelease[],
  now: Date = new Date()
) {
  const nowMs = now.getTime()
  return releases.filter((release) => Date.parse(release.publishedAt) <= nowMs)
}

export function getLatestPublishedSequence(
  releases: readonly ChangelogRelease[],
  now: Date = new Date()
) {
  return getPublishedChangelogs(releases, now).reduce(
    (latest, release) => Math.max(latest, release.sequence),
    0
  )
}

export function getUnseenChangelogs(
  releases: readonly ChangelogRelease[],
  afterSequence: number,
  now: Date = new Date()
) {
  return getPublishedChangelogs(releases, now)
    .filter((release) => release.sequence > afterSequence)
    .sort((left, right) => right.sequence - left.sequence)
}

export function getChangelogPage(
  releases: readonly ChangelogRelease[],
  cursor: number | null,
  limit: number,
  now: Date = new Date()
): ChangelogPage {
  const eligible = getPublishedChangelogs(releases, now)
    .filter((release) => cursor === null || release.sequence < cursor)
    .sort((left, right) => right.sequence - left.sequence)
  const items = eligible.slice(0, limit)
  const hasMore = eligible.length > items.length

  return {
    items,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1].sequence : null,
  }
}

export function isPublishedSequence(
  releases: readonly ChangelogRelease[],
  sequence: number,
  now: Date = new Date()
) {
  return getPublishedChangelogs(releases, now).some(
    (release) => release.sequence === sequence
  )
}
