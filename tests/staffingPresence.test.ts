import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getLatestStaffingResetBoundary,
  getMillisecondsUntilNextStaffingReset,
  getStaffingResetCycleKey,
} from '../lib/staffingPresence.ts'

test('Staffing resets at 6 AM Eastern Standard Time in winter', () => {
  const beforeReset = new Date('2026-01-15T10:59:00.000Z')

  assert.equal(
    getLatestStaffingResetBoundary(beforeReset).toISOString(),
    '2026-01-14T11:00:00.000Z'
  )
  assert.equal(getMillisecondsUntilNextStaffingReset(beforeReset), 60_000)
  assert.equal(getStaffingResetCycleKey(beforeReset), '2026-01-14')
})

test('Staffing reset follows Eastern daylight saving time in summer', () => {
  const beforeReset = new Date('2026-07-15T09:59:00.000Z')
  const atReset = new Date('2026-07-15T10:00:00.000Z')

  assert.equal(getMillisecondsUntilNextStaffingReset(beforeReset), 60_000)
  assert.equal(
    getLatestStaffingResetBoundary(atReset).toISOString(),
    '2026-07-15T10:00:00.000Z'
  )
  assert.equal(getStaffingResetCycleKey(atReset), '2026-07-15')
})
