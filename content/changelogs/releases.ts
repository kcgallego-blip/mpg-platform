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
  {
    sequence: 2,
    version: '1.1.1',
    title: 'Clearer CLAD and Zendesk ticket logging',
    publishedAt: '2026-08-26T10:00:00.000Z',
    changes: {
      added: [
        'The CLAD extension now shows unlogged tickets and explains why they were not logged.',
      ],
      improved: [
        'Improved Zendesk ticket logging for merged tickets.',
      ],
      fixed: [
        'Fixed a bug where the extension would not log tickets when there are multiple ticket tabs are open.',
      ],
    },
  },
  {
    sequence: 3,
    version: '1.1.2',
    title: 'Team Stats view',
    publishedAt: '2026-08-28T10:00:00.000Z',
    changes: {
      added: [
        'Agents can now view their team\'s stats in the Stats page.',
      ],
      improved: [],
      fixed: [],
    },
  },
  {
    sequence: 4,
    version: '1.2.0',
    title: 'AI guidance and agent coaching insights',
    publishedAt: '2026-09-12T10:00:00.000Z',
    changes: {
      added: [
        'Agents now receive personalized AI-powered guidance on the Home page based on their latest available work insights (BETA TEST).',
        'Team leaders can now use Agent Insight to review agent performance, strengths, and improvement priorities.',
        'Selected agents for pilot testing of attendance management. (BETA TEST)',
      ],
      improved: [],
      fixed: [],
    },
  },
] as const satisfies readonly ChangelogRelease[]
