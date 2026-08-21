import assert from 'node:assert/strict'
import test from 'node:test'
import { canUploadStats } from '../lib/statsAccess.ts'
import {
  formatStatValue,
  getStatsMonthOptions,
  getStatsWeekOptions,
  isNAField,
} from '../lib/statsUtils.ts'

test('stats month options include every month through the current month', () => {
  assert.deepEqual(
    getStatsMonthOptions(new Date(2026, 7, 12)),
    [1, 2, 3, 4, 5, 6, 7, 8]
  )
  assert.deepEqual(
    getStatsMonthOptions(new Date(2026, 8, 1)),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  )
})

test('stats upload RBAC includes current and legacy management roles', () => {
  for (const role of ['Admin', 'Team Leader', 'Operations Manager', 'Manager', 'Supervisor']) {
    assert.equal(canUploadStats(role), true, role)
  }

  for (const role of ['Agent', 'IT', null, undefined]) {
    assert.equal(canUploadStats(role), false, String(role))
  }
})

test('includes a loaded week ahead of the browser calendar week', () => {
  assert.deepEqual(getStatsWeekOptions(29, [30]), [30, 29, 28, 27, 26, 25, 24, 23])
})

test('keeps the recent week window when no database periods are available', () => {
  assert.deepEqual(getStatsWeekOptions(30), [30, 29, 28, 27, 26, 25, 24, 23])
})

test('targetless stats retain their imported values for the team table', () => {
  const metrics = {
    dsat: '12%',
    mod_value: 5,
    fcr_value: 17,
    surveys_answered: 23,
    calls_touched: 41,
    tickets_solved: 38,
  }

  for (const [fieldName, value] of Object.entries(metrics)) {
    assert.equal(isNAField(fieldName), true)
    assert.notEqual(formatStatValue(value, fieldName), '—')
  }

  assert.equal(formatStatValue(metrics.dsat, 'dsat'), '12%')
  assert.equal(formatStatValue(metrics.mod_value, 'mod_value'), '5')
  assert.equal(formatStatValue(metrics.fcr_value, 'fcr_value'), '17')
  assert.equal(formatStatValue(metrics.surveys_answered, 'surveys_answered'), '23')
  assert.equal(formatStatValue(metrics.calls_touched, 'calls_touched'), '41')
  assert.equal(formatStatValue(metrics.tickets_solved, 'tickets_solved'), '38')
})

test('TPH is rounded to a whole number by the shared stats formatter', () => {
  assert.equal(formatStatValue(5.49, 'tph'), '5')
  assert.equal(formatStatValue(5.5, 'tph'), '6')
  assert.equal(formatStatValue('7.8', 'tph'), '8')
  assert.equal(formatStatValue('-', 'tph'), 'Not available')
})
