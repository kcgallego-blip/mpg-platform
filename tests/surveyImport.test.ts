import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findSurveyHeaderRowIndex,
  mergeExistingSurveyRecord,
  mergeSurveyUploadDuplicates,
  parseSurveyImportRows,
} from '../lib/surveyImport.ts'

test('finds survey headers after an export filter preamble and blank row', () => {
  assert.equal(findSurveyHeaderRowIndex([
    ['Applied filters: Year is 2026'],
    [],
    ['Date', 'ID', 'Agent', 'Agent Email', 'CSAT', 'MOD Positive', 'MOD Negative'],
  ]), 2)
})

test('keeps Neutral and Unsatisfied feedback and preserves either comment field', () => {
  const result = parseSurveyImportRows([
    {
      Date: '2026-08-10',
      ID: 'unsatisfied-1',
      Agent: 'Agent One',
      CSAT: 'Unsatisfied',
      'MOD Comment': 'MOD feedback',
      'Open Comment': 'Open feedback',
    },
    {
      Date: '2026-08-11',
      ID: 'neutral-1',
      Agent: 'Agent Two',
      CSAT: 'Neutral',
      'MOD Comment': '',
      'Open Comment': 'Neutral feedback',
    },
    {
      Date: '2026-08-12',
      ID: 'neutral-2',
      Agent: 'Agent Two',
      CSAT: 'Neutral',
      'MOD Comment': '',
      'Open Comment': '',
    },
  ])

  assert.equal(result.records.length, 3)
  assert.equal(result.records[0].mod_comment, 'MOD feedback')
  assert.equal(result.records[0].open_comment, 'Open feedback')
  assert.equal(result.records[1].open_comment, 'Neutral feedback')
  assert.equal(result.records[2].open_comment, null)
})

test('keeps Satisfied feedback with any comment and skips it without comments', () => {
  const result = parseSurveyImportRows([
    { ID: 'mod', Agent: 'Agent', CSAT: 'Satisfied', 'MOD Comment': 'Helpful', 'Open Comment': '' },
    { ID: 'open', Agent: 'Agent', CSAT: 'Satisfied', 'MOD Comment': '', 'Open Comment': 'Great support' },
    { ID: 'none', Agent: 'Agent', CSAT: 'Satisfied', 'MOD Comment': '  ', 'Open Comment': '' },
  ])

  assert.deepEqual(result.records.map(record => record.response_id), ['mod', 'open'])
  assert.equal(result.records[1].open_comment, 'Great support')
  assert.equal(result.skippedSatisfiedWithoutComment, 1)
})

test('maps MOD Positive and MOD Negative export columns to comments', () => {
  const result = parseSurveyImportRows([
    { ID: 'positive', Agent: 'Agent', CSAT: 'Satisfied', 'MOD Positive': 'Great support' },
    { ID: 'negative', Agent: 'Agent', CSAT: 'Unsatisfied', 'MOD Negative': 'Needs improvement' },
  ])

  assert.equal(result.records.length, 2)
  assert.equal(result.records[0].mod_comment, 'Great support')
  assert.equal(result.records[1].mod_comment, 'Needs improvement')
})

test('merges duplicate upload rows without dropping either comment', () => {
  const parsed = parseSurveyImportRows([
    { ID: 'same', Agent: 'Agent', CSAT: 'Unsatisfied', 'MOD Comment': 'First', 'Open Comment': '' },
    { ID: 'same', Agent: 'Agent', CSAT: 'Unsatisfied', 'MOD Comment': '', 'Open Comment': 'Second' },
  ])
  const merged = mergeSurveyUploadDuplicates(parsed.records)

  assert.equal(merged.records.length, 1)
  assert.equal(merged.duplicateRowsInUpload, 1)
  assert.equal(merged.records[0].mod_comment, 'First')
  assert.equal(merged.records[0].open_comment, 'Second')
})

test('repairs a missing stored comment without erasing an existing comment', () => {
  const merged = mergeExistingSurveyRecord(
    {
      survey_date: '2026-08-10',
      response_id: 'existing',
      agent: 'Agent',
      csat: 'Unsatisfied',
      mod_comment: 'Keep this',
      open_comment: null,
    },
    {
      survey_date: '2026-08-10',
      response_id: 'existing',
      agent: 'Agent',
      csat: 'Unsatisfied',
      mod_comment: null,
      open_comment: 'Restore this',
    }
  )

  assert.equal(merged.mod_comment, 'Keep this')
  assert.equal(merged.open_comment, 'Restore this')
})
