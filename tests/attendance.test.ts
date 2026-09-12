import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatAttendanceTime,
  formatAttendanceTime12Hour,
  getDefaultShiftDate,
  getPhilippineWallClockTimestamp,
  getOperationalCalendarDate,
  getMonthRange,
  inferShiftGroup,
  normalizeWeekday,
  isDateKey,
} from '../lib/attendance.ts'

test('normalizes abbreviated and full weekday names consistently', () => {
  assert.equal(normalizeWeekday('Mon'), 'monday')
  assert.equal(normalizeWeekday('Monday'), 'monday')
  assert.equal(normalizeWeekday('Tues.'), 'tuesday')
  assert.equal(normalizeWeekday('Thu'), 'thursday')
  assert.equal(normalizeWeekday('Sun'), 'sunday')
})

test('maps Overnight business shifts to the following calendar date', () => {
  assert.equal(getOperationalCalendarDate('2026-09-07', 'normal_graveyard'), '2026-09-07')
  assert.equal(getOperationalCalendarDate('2026-09-07', 'overnight'), '2026-09-08')
  assert.equal(getOperationalCalendarDate('2026-12-31', 'overnight'), '2027-01-01')
})

test('uses a DST-aware 6 AM Eastern business shift-date rollover', () => {
  assert.equal(getDefaultShiftDate(new Date('2026-07-23T09:59:59Z')), '2026-07-22')
  assert.equal(getDefaultShiftDate(new Date('2026-07-23T10:00:00Z')), '2026-07-23')
  assert.equal(getDefaultShiftDate(new Date('2026-01-23T10:59:59Z')), '2026-01-22')
  assert.equal(getDefaultShiftDate(new Date('2026-01-23T11:00:00Z')), '2026-01-23')
})

test('captures self-service attendance using Philippine wall-clock time', () => {
  assert.equal(getPhilippineWallClockTimestamp(new Date('2026-09-12T10:00:00Z')), '2026-09-12 18:00:00')
  assert.equal(getPhilippineWallClockTimestamp(new Date('2026-01-12T10:00:00Z')), '2026-01-12 18:00:00')
})

test('infers overnight cohort starts from roster clocks with or without seconds', () => {
  assert.equal(inferShiftGroup('01:00:00'), 'overnight')
  assert.equal(inferShiftGroup('1:00 AM'), 'overnight')
  assert.equal(inferShiftGroup('21:00:00'), 'normal_graveyard')
})

test('formats timestamp-without-time-zone values without timezone conversion', () => {
  assert.equal(formatAttendanceTime('2026-07-23T08:30:15'), '08:30:15')
  assert.equal(formatAttendanceTime('2026-07-23 21:04:09.123'), '21:04:09')
  assert.equal(formatAttendanceTime(null), '--')
})

test('formats calendar clocks in 12-hour time without timezone conversion', () => {
  assert.equal(formatAttendanceTime12Hour('2026-09-07 00:05:00'), '12:05 AM')
  assert.equal(formatAttendanceTime12Hour('2026-09-07 09:30:00'), '9:30 AM')
  assert.equal(formatAttendanceTime12Hour('2026-09-07 12:00:00'), '12:00 PM')
  assert.equal(formatAttendanceTime12Hour('2026-09-07 21:45:00'), '9:45 PM')
  assert.equal(formatAttendanceTime12Hour(null), '--')
})

test('validates real calendar dates and builds a calendar month range', () => {
  assert.equal(isDateKey('2024-02-29'), true)
  assert.equal(isDateKey('2025-02-29'), false)
  assert.deepEqual(getMonthRange(new Date(2026, 1, 15)), {
    from: '2026-02-01',
    to: '2026-02-28',
  })
})
