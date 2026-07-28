import assert from 'node:assert/strict'
import test from 'node:test'
import { getStatsWeekOptions } from '../lib/statsUtils.ts'

test('includes a loaded week ahead of the browser calendar week', () => {
  assert.deepEqual(getStatsWeekOptions(29, [30]), [30, 29, 28, 27, 26, 25, 24, 23])
})

test('keeps the recent week window when no database periods are available', () => {
  assert.deepEqual(getStatsWeekOptions(30), [30, 29, 28, 27, 26, 25, 24, 23])
})
