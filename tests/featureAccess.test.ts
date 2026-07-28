import assert from 'node:assert/strict'
import test from 'node:test'
import { canRoleAccessAttendance } from '../lib/featureAccess.ts'

test('Admin always has Attendance access', () => {
  assert.equal(canRoleAccessAttendance('Admin', true), true)
  assert.equal(canRoleAccessAttendance('Admin', false), true)
})

test('every assigned non-Admin role follows the Attendance feature switch', () => {
  for (const role of [
    'Agent',
    'Team Leader',
    'Supervisor',
    'Operations Manager',
    'IT',
  ]) {
    assert.equal(canRoleAccessAttendance(role, true), true)
    assert.equal(canRoleAccessAttendance(role, false), false)
  }
})

test('pending accounts do not receive Attendance access', () => {
  assert.equal(canRoleAccessAttendance(null, true), false)
  assert.equal(canRoleAccessAttendance(undefined, true), false)
})
