import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { changelogReleases } from '../content/changelogs/releases.ts'
import { hashChangelogRelease } from './changelogUtils.ts'

const lockPath = fileURLToPath(
  new URL('../content/changelogs/release-lock.json', import.meta.url)
)
const lock = Object.fromEntries(
  changelogReleases.map((release) => [String(release.sequence), hashChangelogRelease(release)])
)

await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
console.log(`Locked ${changelogReleases.length} changelog release(s).`)
