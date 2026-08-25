import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import test from 'node:test'
import {
  getUserThemePreference,
  isThemePreference,
  normalizeThemeUserKey,
  parseThemePreferences,
  resolveTheme,
  withUserThemePreference,
} from '../lib/theme.ts'

test('theme preferences parse safely and discard unsupported values', () => {
  assert.deepEqual(parseThemePreferences(null), {})
  assert.deepEqual(parseThemePreferences('{invalid'), {})
  assert.deepEqual(parseThemePreferences('[]'), {})
  assert.deepEqual(parseThemePreferences(JSON.stringify({
    'agent@m-piece.com': 'dark',
    'manager@m-piece.com': 'light',
    'invalid@m-piece.com': 'system',
    empty: null,
  })), {
    'agent@m-piece.com': 'dark',
    'manager@m-piece.com': 'light',
  })
})

test('theme preferences are isolated by normalized user email', () => {
  const agentPreferences = withUserThemePreference({}, ' Agent@M-Piece.com ', 'dark')
  const preferences = withUserThemePreference(agentPreferences, 'manager@m-piece.com', 'light')

  assert.equal(normalizeThemeUserKey(' Agent@M-Piece.com '), 'agent@m-piece.com')
  assert.equal(getUserThemePreference(preferences, 'AGENT@m-piece.com'), 'dark')
  assert.equal(getUserThemePreference(preferences, 'manager@m-piece.com'), 'light')
  assert.equal(getUserThemePreference(preferences, 'other@m-piece.com'), null)
})

test('theme resolution follows the system only until an explicit choice exists', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(isThemePreference('dark'), true)
  assert.equal(isThemePreference('system'), false)
})

test('serialized preference updates can be consumed by another browser context', () => {
  const firstTab = withUserThemePreference({}, 'agent@m-piece.com', 'dark')
  const secondTab = parseThemePreferences(JSON.stringify(firstTab))

  assert.equal(getUserThemePreference(secondTab, 'agent@m-piece.com'), 'dark')
})

function listUiFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listUiFiles(path)
    return ['.tsx', '.css'].includes(extname(entry.name)) ? [path] : []
  })
}

test('UI surfaces use semantic theme tokens', () => {
  const projectRoot = resolve(import.meta.dirname, '..')
  const files = [
    ...listUiFiles(join(projectRoot, 'app')),
    ...listUiFiles(join(projectRoot, 'components')),
  ]
  const forbidden = [
    /\bbg-white(?:\/\d+)?\b/,
    /\bfrom-white(?:\/\d+)?\b/,
    /\bto-white(?:\/\d+)?\b/,
    /\bvia-blue-50(?:\/\d+)?\b/,
  ]
  const violations = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return forbidden.some((pattern) => pattern.test(source)) ? [file] : []
  })

  assert.deepEqual(violations, [])
})
