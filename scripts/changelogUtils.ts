import { createHash } from 'node:crypto'
import type { ChangelogRelease } from '../content/changelogs/releases.ts'

export function hashChangelogRelease(release: ChangelogRelease) {
  return createHash('sha256').update(JSON.stringify(release)).digest('hex')
}
