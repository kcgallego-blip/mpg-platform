import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChangelogRelease } from '../lib/changelog.ts'
import {
  getChangelogPage,
  getLatestPublishedSequence,
  getUnseenChangelogs,
  isPublishedSequence,
} from '../lib/changelogRules.ts'
import {
  getMostRecentManilaSixPm,
  getNextManilaSixPm,
  isScheduledChangelogCheckDue,
} from '../lib/changelogSchedule.ts'

const releases: ChangelogRelease[] = [
  {
    sequence: 1,
    version: '1.0.0',
    title: 'First',
    publishedAt: '2026-08-24T10:00:00.000Z',
    changes: { added: ['First item'], improved: [], fixed: [] },
  },
  {
    sequence: 2,
    version: '1.1.0',
    title: 'Second',
    publishedAt: '2026-08-25T10:00:00.000Z',
    changes: { added: [], improved: ['Second item'], fixed: [] },
  },
  {
    sequence: 3,
    version: '1.2.0',
    title: 'Future',
    publishedAt: '2026-08-26T10:00:00.000Z',
    changes: { added: [], improved: [], fixed: ['Future item'] },
  },
]

test('scheduled releases remain hidden until 6 PM Philippine time', () => {
  const beforeRelease = new Date('2026-08-25T09:59:59.999Z')
  const atRelease = new Date('2026-08-25T10:00:00.000Z')

  assert.equal(getLatestPublishedSequence(releases, beforeRelease), 1)
  assert.equal(getLatestPublishedSequence(releases, atRelease), 2)
  assert.equal(isPublishedSequence(releases, 2, beforeRelease), false)
  assert.equal(isPublishedSequence(releases, 2, atRelease), true)
})

test('unseen releases are newest first and exclude future releases', () => {
  const unseen = getUnseenChangelogs(
    releases,
    0,
    new Date('2026-08-25T12:00:00.000Z')
  )

  assert.deepEqual(unseen.map((release) => release.sequence), [2, 1])
})

test('history pagination uses a descending sequence cursor', () => {
  const now = new Date('2026-08-27T12:00:00.000Z')
  const firstPage = getChangelogPage(releases, null, 2, now)
  const secondPage = getChangelogPage(releases, firstPage.nextCursor, 2, now)

  assert.deepEqual(firstPage.items.map((release) => release.sequence), [3, 2])
  assert.equal(firstPage.nextCursor, 2)
  assert.deepEqual(secondPage.items.map((release) => release.sequence), [1])
  assert.equal(secondPage.nextCursor, null)
})

test('next and most recent daily checks use 6 PM Philippine time', () => {
  const beforeSix = Date.parse('2026-08-25T09:30:00.000Z')
  const atSix = Date.parse('2026-08-25T10:00:00.000Z')

  assert.equal(getNextManilaSixPm(beforeSix), Date.parse('2026-08-25T10:00:00.000Z'))
  assert.equal(getNextManilaSixPm(atSix), Date.parse('2026-08-26T10:00:00.000Z'))
  assert.equal(getMostRecentManilaSixPm(beforeSix), Date.parse('2026-08-24T10:00:00.000Z'))
  assert.equal(getMostRecentManilaSixPm(atSix), atSix)
})

test('focus checks run only when the most recent 6 PM check was missed', () => {
  const now = Date.parse('2026-08-25T12:00:00.000Z')

  assert.equal(isScheduledChangelogCheckDue(null, now), true)
  assert.equal(
    isScheduledChangelogCheckDue(Date.parse('2026-08-25T09:59:59.000Z'), now),
    true
  )
  assert.equal(
    isScheduledChangelogCheckDue(Date.parse('2026-08-25T10:00:01.000Z'), now),
    false
  )
})
