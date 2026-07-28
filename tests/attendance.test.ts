import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatAttendanceTime,
  getDefaultShiftDate,
  getMonthRange,
  isDateKey,
} from '../lib/attendance.ts'

test('uses the fixed UTC-8 calendar date for the default shift date', () => {
  assert.equal(getDefaultShiftDate(new Date('2026-07-23T07:59:59Z')), '2026-07-22')
  assert.equal(getDefaultShiftDate(new Date('2026-07-23T08:00:00Z')), '2026-07-23')
})

test('formats timestamp-without-time-zone values without timezone conversion', () => {
  assert.equal(formatAttendanceTime('2026-07-23T08:30:15'), '08:30:15')
  assert.equal(formatAttendanceTime('2026-07-23 21:04:09.123'), '21:04:09')
  assert.equal(formatAttendanceTime(null), '--')
})

test('validates real calendar dates and builds a calendar month range', () => {
  assert.equal(isDateKey('2024-02-29'), true)
  assert.equal(isDateKey('2025-02-29'), false)
  assert.deepEqual(getMonthRange(new Date(2026, 1, 15)), {
    from: '2026-02-01',
    to: '2026-02-28',
  })
})
