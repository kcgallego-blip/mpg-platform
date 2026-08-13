import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldCacheRoleScopedData } from '../lib/statsAccess.ts'
import {
  getAgentStatsFallbackPeriod,
  getStatsNameAnchorTokens,
  getStatsNameSearchFragments,
  getUniqueStatsIdentityNames,
  resolveRosterScopedAgentNames,
  resolveStatsNameFromCandidates,
} from '../lib/statsIdentity.ts'

test('Agent scorecards bypass the stats response cache', () => {
  assert.equal(shouldCacheRoleScopedData('Agent'), false)
  assert.equal(shouldCacheRoleScopedData(' agent '), false)
  assert.equal(shouldCacheRoleScopedData('Team Leader'), true)
  assert.equal(shouldCacheRoleScopedData('Admin'), true)
})

test('an Agent initially falls back to the latest period containing their scorecard', () => {
  assert.equal(getAgentStatsFallbackPeriod(33, [32, 31, 30], false), 32)
  assert.equal(getAgentStatsFallbackPeriod(33, [33, 32, 31], false), null)
  assert.equal(getAgentStatsFallbackPeriod(33, [32, 31, 30], true), null)
})

test('stats identity matching supports reordered names and middle initials', () => {
  assert.equal(
    resolveStatsNameFromCandidates(
      ['Rodriguez, Aldrei', 'Alexandra Corpuz'],
      ['Aldrei V. Rodriguez']
    ),
    'Rodriguez, Aldrei'
  )
})

test('stats identity matching tolerates one source-name typo with an exact anchor', () => {
  assert.equal(
    resolveStatsNameFromCandidates(
      ['Jesse Rey Cabuguasan', 'Jessica Cabugao'],
      ['Jesse Cabuguason']
    ),
    'Jesse Rey Cabuguasan'
  )
})

test('canonical roster identity is used when the profile name does not match', () => {
  assert.equal(
    resolveStatsNameFromCandidates(
      ['Carla Medina', 'Cassandra Garcia'],
      getUniqueStatsIdentityNames(['Unrelated Profile Name', 'Carla Medina'])
    ),
    'Carla Medina'
  )
})

test('authenticated profile identity wins over a conflicting email-linked roster fallback', () => {
  assert.deepEqual(
    resolveRosterScopedAgentNames(
      ['John Velasquez', 'John Louis Soriano'],
      ['John Emmanuel Velasquez', 'John Louis Soriano'],
      ['John Emmanuel Velasquez', 'John Louis Soriano']
    ),
    ['John Velasquez']
  )
})

test('multiple source aliases are allowed only when they uniquely map to one roster agent', () => {
  assert.deepEqual(
    resolveRosterScopedAgentNames(
      ['Nino Candare', 'Nino C Candare'],
      ['Nino Candare'],
      ['Nino Candare', 'Nina Candare']
    ),
    ['Nino Candare', 'Nino C Candare']
  )

  assert.deepEqual(
    resolveRosterScopedAgentNames(
      ['John David Santos', 'John Paul Santos'],
      ['John Santos'],
      ['John David Santos', 'John Paul Santos']
    ),
    []
  )
})

test('an ambiguous identity never exposes another agent scorecard', () => {
  assert.equal(
    resolveStatsNameFromCandidates(
      ['John David Santos', 'John Paul Santos'],
      ['John Santos']
    ),
    null
  )
})

test('name anchors handle last-name-first roster formatting and suffixes', () => {
  assert.deepEqual(getStatsNameAnchorTokens('Santos, John Paul Jr.'), ['john', 'santos'])
  assert.deepEqual(getStatsNameAnchorTokens('John Paul Santos Jr.'), ['john', 'santos'])
})

test('search fragments can discover source names containing accented characters', () => {
  const fragments = getStatsNameSearchFragments('Shynna Argañoza')

  assert.equal(fragments.includes('shy%a'), true)
  assert.equal(fragments.includes('arg%a'), true)
  assert.equal(getStatsNameSearchFragments('Nino Candare').includes('ni%o'), true)
})
