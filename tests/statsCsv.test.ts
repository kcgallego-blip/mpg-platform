import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatsCsvValue } from '../lib/statsCsv.ts'

test('reads the existing underscored CSAT and NPS headers', () => {
  const record = { CSAT_Score: '95%', NPS_Score: '60' }

  assert.equal(getStatsCsvValue(record, 'CSAT_Score', 'CSAT'), '95%')
  assert.equal(getStatsCsvValue(record, 'NPS_Score', 'NPS'), '60')
})

test('falls back to plain CSAT and NPS headers', () => {
  const record = { CSAT: '90%', NPS: '55' }

  assert.equal(getStatsCsvValue(record, 'CSAT_Score', 'CSAT'), '90%')
  assert.equal(getStatsCsvValue(record, 'NPS_Score', 'NPS'), '55')
})
