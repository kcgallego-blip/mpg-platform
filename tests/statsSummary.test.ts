import assert from 'node:assert/strict'
import test from 'node:test'
import { averageStatsSummary } from '../lib/statsSummary.ts'

test('averages rates and time values while totaling requested count metrics', () => {
  const summary = averageStatsSummary([
    {
      acw: '01:00',
      aht: '08:00',
      hold: '00:30',
      talk_time: '10:00',
      csat_score: '90%',
      dsat: '10%',
      nps_score: 40,
      promoter: 4,
      mod: '30%',
      mod_value: 3,
      fcr: '80%',
      fcr_value: 8,
      surveys_answered: 10,
      tph: 5,
    },
    {
      acw: '02:00',
      aht: '10:00',
      hold: '01:30',
      talk_time: '12:00',
      csat_score: '80%',
      dsat: '20%',
      nps_score: 60,
      promoter: 8,
      mod: '50%',
      mod_value: 5,
      fcr: '90%',
      fcr_value: 10,
      surveys_answered: 20,
      tph: 7,
    },
  ])

  assert.deepEqual(summary, {
    acw: '01:30',
    aht: '09:00',
    hold: '01:00',
    talk_time: '11:00',
    csat_score: '85%',
    dsat: '15%',
    nps_score: 50,
    promoter: 6,
    mod: '40%',
    mod_value: 8,
    fcr: '85%',
    fcr_value: 18,
    surveys_answered: 30,
    tph: 6,
  })
})

test('ignores missing metric values without excluding the rest of the row', () => {
  const summary = averageStatsSummary([
    { acw: '01:00', csat_score: null, tph: '-' },
    { acw: null, csat_score: '0.9', tph: 0 },
  ])

  assert.equal(summary?.acw, '01:00')
  assert.equal(summary?.csat_score, '90%')
  assert.equal(summary?.tph, 0)
  assert.equal(summary?.aht, null)
})

test('does not count Power BI missing-time markers as zero-duration values', () => {
  const summary = averageStatsSummary([
    { acw: '00:52', aht: '08:30', hold: '01:10', talk_time: '07:45' },
    { acw: ':', aht: ':', hold: ':', talk_time: ':' },
    { acw: '-', aht: '–', hold: '—', talk_time: '' },
  ])

  assert.equal(summary?.acw, '00:52')
  assert.equal(summary?.aht, '08:30')
  assert.equal(summary?.hold, '01:10')
  assert.equal(summary?.talk_time, '07:45')
})

test('returns no summary when there are no matching rows', () => {
  assert.equal(averageStatsSummary([]), null)
})
