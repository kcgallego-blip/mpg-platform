export const CHANGELOG_CATEGORIES = ['added', 'improved', 'fixed'] as const

export type ChangelogCategory = typeof CHANGELOG_CATEGORIES[number]

export type ChangelogRelease = {
  sequence: number
  version: string
  title: string
  publishedAt: string
  changes: Record<ChangelogCategory, readonly string[]>
}

export type ChangelogStatus = {
  lastSeenSequence: number
  latestPublishedSequence: number
  hasUnseen: boolean
}

export type ChangelogPage = {
  items: ChangelogRelease[]
  nextCursor: number | null
}

export const CHANGELOG_SYNC_STORAGE_KEY = 'mpg_changelog_sync'
