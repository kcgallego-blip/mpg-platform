import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { changelogReleases } from '../content/changelogs/releases.ts'
import { hashChangelogRelease } from './changelogUtils.ts'

const projectFile = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const packageJson = JSON.parse(
  await readFile(projectFile('package.json'), 'utf8')
) as { version?: unknown }
const releaseLock = JSON.parse(
  await readFile(projectFile('content/changelogs/release-lock.json'), 'utf8')
) as Record<string, string>

assert.equal(typeof packageJson.version, 'string', 'package.json must contain a version')
assert.ok(changelogReleases.length > 0, 'At least one changelog release is required')

let previousSequence = 0
const seenVersions = new Set<string>()

for (const release of changelogReleases) {
  assert.ok(Number.isSafeInteger(release.sequence), 'Release sequence must be a safe integer')
  assert.ok(release.sequence > previousSequence, 'Release sequences must be unique and increasing')
  assert.match(release.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `Invalid version ${release.version}`)
  assert.ok(!seenVersions.has(release.version), `Duplicate changelog version ${release.version}`)
  assert.ok(release.title.trim().length > 0, `Release ${release.sequence} needs a title`)
  assert.ok(Number.isFinite(Date.parse(release.publishedAt)), `Release ${release.sequence} has an invalid timestamp`)

  const timestamp = new Date(release.publishedAt)
  assert.equal(timestamp.getUTCHours(), 10, `Release ${release.sequence} must publish at 6:00 PM Philippine time`)
  assert.equal(timestamp.getUTCMinutes(), 0, `Release ${release.sequence} must publish on the hour`)

  const categories = ['added', 'improved', 'fixed'] as const
  assert.ok(categories.some((category) => release.changes[category].length > 0), `Release ${release.sequence} needs at least one change`)
  for (const category of categories) {
    assert.ok(Array.isArray(release.changes[category]), `Release ${release.sequence} is missing ${category}`)
    for (const item of release.changes[category]) {
      assert.ok(item.trim().length > 0, `Release ${release.sequence} contains an empty ${category} item`)
    }
  }

  const expectedHash = releaseLock[String(release.sequence)]
  assert.ok(expectedHash, `Release ${release.sequence} is not in release-lock.json; run npm run changelog:lock`)
  assert.equal(expectedHash, hashChangelogRelease(release), `Published release ${release.sequence} was modified; restore it or deliberately refresh the lock`)

  seenVersions.add(release.version)
  previousSequence = release.sequence
}

assert.ok(
  changelogReleases.some((release) => release.version === packageJson.version),
  `No changelog release matches package version ${String(packageJson.version)}`
)
assert.deepEqual(
  Object.keys(releaseLock).sort((left, right) => Number(left) - Number(right)),
  changelogReleases.map((release) => String(release.sequence)),
  'release-lock.json must contain exactly the published sequences'
)

console.log(`Validated ${changelogReleases.length} changelog release(s) for version ${packageJson.version}.`)
