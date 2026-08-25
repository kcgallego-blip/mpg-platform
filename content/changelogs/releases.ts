export type ChangelogCategory = 'added' | 'improved' | 'fixed'

export type ChangelogChanges = Record<ChangelogCategory, readonly string[]>

export type ChangelogRelease = {
  sequence: number
  version: string
  title: string
  publishedAt: string
  changes: ChangelogChanges
}

/**
 * Append-only published history. This file must only be imported by server-side
 * code so scheduled releases are not bundled into the browser before release.
 */
export const changelogReleases = [
  {
    sequence: 1,
    version: '1.1.0',
    title: 'Changelogs, profiles, and dark mode are now available',
    publishedAt: '2026-08-25T10:00:00.000Z',
    changes: {
      added: [
        'A Changelogs page now keeps the complete history of user-visible releases from the portal.',
        'A new Profile page where you can view your account information and manage your preferences.',
        'Dark mode, with a simple appearance toggle that remembers your choice on your browser.',
      ],
      improved: [
        'The Sign out button has moved from the header menu to the bottom of the Profile page.',
      ],
      fixed: [],
    },
  },
] as const satisfies readonly ChangelogRelease[]
