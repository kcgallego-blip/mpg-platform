import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResolvedAttendanceDay } from '../lib/attendance.ts'
import { chooseCurrentClockDay, getClockActionState, getSelfServiceOtReview } from '../lib/attendanceClock.ts'
import { normalizeClientIp, normalizeOfficeNetwork } from '../lib/attendanceNetwork.ts'

const attendanceDay = (overrides: Partial<ResolvedAttendanceDay> = {}): ResolvedAttendanceDay => ({
  agent: 'agent@example.com', agentName: 'Test Agent', teamLeader: 'Lead', shiftDate: '2026-09-09',
  timeIn: null, timeOut: null, startShift: '19:00:00', endShift: '04:00:00', off1: 'Sun', off2: 'Mon',
  shiftGroup: 'normal_graveyard', status: 'Scheduled', exceptionKind: null, scheduleSource: 'snapshot',
  attendanceOutcome: null, preShiftOtApproved: false, postShiftOtApproved: false,
  preShiftOtReview: 'not_required', postShiftOtReview: 'not_required', preShiftOtMinutes: 0,
  postShiftOtMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, updatedAt: null, ...overrides,
})

test('keeps a graveyard action on the previous attendance date after midnight', () => {
  const yesterday = attendanceDay({ shiftDate: '2026-09-08' })
  const today = attendanceDay({ shiftDate: '2026-09-09' })
  assert.equal(chooseCurrentClockDay([yesterday, today], '2026-09-09 02:30:00').day?.shiftDate, '2026-09-08')
})

test('uses the actual Eastern calendar date for an overnight shift', () => {
  const today = attendanceDay({ shiftDate: '2026-09-09', shiftGroup: 'overnight', startShift: '01:00:00', endShift: '10:00:00' })
  assert.equal(chooseCurrentClockDay([today], '2026-09-09 01:15:00').day?.shiftDate, '2026-09-09')
})

test('keeps an unfinished clock until 24 hours when today is a rest day', () => {
  const open = attendanceDay({ shiftDate: '2026-09-08', timeIn: '2026-09-08 19:00:00' })
  const restDay = attendanceDay({ shiftDate: '2026-09-09', status: 'Day Off' })
  const selected = chooseCurrentClockDay([open, restDay], '2026-09-09 20:00:00')
  assert.equal(selected.day?.shiftDate, '2026-09-08')
  assert.equal(selected.staleOpen, true)
})

test('labels rest-day clocks as RDOT and protects leave dates', () => {
  assert.deepEqual(getClockActionState(attendanceDay({ status: 'Day Off' })), { action: 'time_in', actionLabel: 'RDOT In', blockedReason: null })
  assert.deepEqual(getClockActionState(attendanceDay({ status: 'RDOT - Currently Working', timeIn: '2026-09-09 19:00:00' })), { action: 'time_out', actionLabel: 'RDOT Out', blockedReason: null })
  assert.equal(getClockActionState(attendanceDay({ status: 'Vacation Leave' })).action, null)
})

test('opens self-service OT review at exactly 120 minutes but never for RDOT', () => {
  assert.equal(getSelfServiceOtReview(119, false), 'not_required')
  assert.equal(getSelfServiceOtReview(120, false), 'pending')
  assert.equal(getSelfServiceOtReview(240, true), 'not_required')
})

test('normalizes proxy IP values and validates IPv4 and IPv6 networks', () => {
  assert.equal(normalizeClientIp('203.0.113.10:443'), '203.0.113.10')
  assert.equal(normalizeClientIp('[2001:db8::1]:443'), '2001:db8::1')
  assert.equal(normalizeClientIp('::ffff:192.0.2.7'), '192.0.2.7')
  assert.equal(normalizeOfficeNetwork('192.0.2.7'), '192.0.2.7/32')
  assert.equal(normalizeOfficeNetwork('2001:db8::/48'), '2001:db8::/48')
  assert.throws(() => normalizeOfficeNetwork('192.0.2.0/33'), /Invalid CIDR prefix/)
})
