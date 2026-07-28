import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUGGESTION_MAX_LENGTH,
  isSuggestionsRole,
  validateSuggestion,
} from '../lib/suggestions.ts'

test('only Agent and Admin can access Suggestions', () => {
  assert.equal(isSuggestionsRole('Agent'), true)
  assert.equal(isSuggestionsRole('Admin'), true)
  assert.equal(isSuggestionsRole('Supervisor'), false)
  assert.equal(isSuggestionsRole(null), false)
})

test('suggestions must contain non-whitespace content', () => {
  assert.equal(validateSuggestion('').error, 'Suggestion content is required')
  assert.equal(validateSuggestion('   ').error, 'Suggestion content is required')
  assert.equal(validateSuggestion(null).error, 'Suggestion content is required')
})

test('suggestions are trimmed and length limited', () => {
  assert.deepEqual(validateSuggestion('  Improve the knowledge base.  '), {
    error: null,
    value: 'Improve the knowledge base.',
  })
  assert.ok(validateSuggestion('x'.repeat(SUGGESTION_MAX_LENGTH + 1)).error)
})
