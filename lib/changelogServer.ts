import 'server-only'

import { changelogReleases } from '@/content/changelogs/releases'
import {
  getChangelogPage,
  getLatestPublishedSequence,
  getUnseenChangelogs,
  isPublishedSequence,
} from './changelogRules'

export function getLatestPublishedChangelogSequence(now = new Date()) {
  return getLatestPublishedSequence(changelogReleases, now)
}

export function getPublishedChangelogsAfter(sequence: number, now = new Date()) {
  return getUnseenChangelogs(changelogReleases, sequence, now)
}

export function getPublishedChangelogPage(
  cursor: number | null,
  limit: number,
  now = new Date()
) {
  return getChangelogPage(changelogReleases, cursor, limit, now)
}

export function isValidPublishedChangelogSequence(sequence: number, now = new Date()) {
  return isPublishedSequence(changelogReleases, sequence, now)
}
