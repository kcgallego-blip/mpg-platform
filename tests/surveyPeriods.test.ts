import assert from 'node:assert/strict'
import test from 'node:test'
import { getSurveyPeriodOptions } from '../lib/surveyPeriods.ts'

test('keeps the current week available without matching survey rows', () => {
  const options = getSurveyPeriodOptions([], 'weekly', new Date(2026, 7, 13))

  assert.equal(options.length, 1)
  assert.equal(options[0].value, '2026-W33')
  assert.match(options[0].label, /^Week 33 - /)
})

test('does not duplicate the current week and keeps weeks newest first', () => {
  const options = getSurveyPeriodOptions([
    { survey_date: '2026-08-13' },
    { survey_date: '2026-08-12' },
    { survey_date: '2026-08-01' },
  ], 'weekly', new Date(2026, 7, 13))

  assert.deepEqual(options.map(option => option.value), ['2026-W33', '2026-W31'])
})

test('does not inject a month when there are no uploaded survey dates', () => {
  const options = getSurveyPeriodOptions([], 'monthly', new Date(2026, 7, 13))

  assert.deepEqual(options, [])
})
