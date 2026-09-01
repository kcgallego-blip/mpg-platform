import assert from 'node:assert/strict'
import test from 'node:test'
import { canResetLocalPassword, canViewAccounts, sessionVersionsMatch } from '../lib/accountAccess.ts'
import {
  evaluatePassword,
  getPasswordPolicyError,
  passwordsMatch,
} from '../lib/passwordPolicy.ts'
import { generateTemporaryPassword } from '../lib/temporaryPassword.ts'

test('password policy requires ten characters and three character types', () => {
  assert.match(getPasswordPolicyError('Short1!') || '', /10 characters/)
  assert.match(getPasswordPolicyError('alllowercase') || '', /at least three/)
  assert.equal(getPasswordPolicyError('longlower1!'), null)
  assert.equal(evaluatePassword('longlower1!').valid, true)
})

test('password strength progresses through the documented levels', () => {
  assert.deepEqual(
    ['', 'abc', 'abcdefgh1', 'longlower1!', 'VeryStrongPwd1!'].map((password) => evaluatePassword(password).strength),
    ['empty', 'weak', 'fair', 'good', 'strong'],
  )
})

test('password confirmation must be non-empty and exact', () => {
  assert.equal(passwordsMatch('Password1!', ''), false)
  assert.equal(passwordsMatch('Password1!', 'password1!'), false)
  assert.equal(passwordsMatch('Password1!', 'Password1!'), true)
})

test('temporary passwords are sixteen characters and contain every character type', () => {
  for (let index = 0; index < 50; index += 1) {
    const password = generateTemporaryPassword()
    const evaluation = evaluatePassword(password)

    assert.equal(password.length, 16)
    assert.equal(evaluation.hasLowercase, true)
    assert.equal(evaluation.hasUppercase, true)
    assert.equal(evaluation.hasNumber, true)
    assert.equal(evaluation.hasSymbol, true)
  }
})

test('only Admin and IT can view accounts', () => {
  assert.equal(canViewAccounts('Admin'), true)
  assert.equal(canViewAccounts('IT'), true)
  assert.equal(canViewAccounts('it'), true)
  assert.equal(canViewAccounts('Operations Manager'), false)
  assert.equal(canViewAccounts(null), false)
})

test('session versions preserve legacy version zero and reject reset sessions', () => {
  assert.equal(sessionVersionsMatch(undefined, 0), true)
  assert.equal(sessionVersionsMatch(0, undefined), true)
  assert.equal(sessionVersionsMatch(0, 1), false)
  assert.equal(sessionVersionsMatch(1, 1), true)
  assert.equal(sessionVersionsMatch(1, 2), false)
})

test('password reset RBAC follows hierarchy and denies self-reset', () => {
  const admin = { email: 'admin@m-piece.com', role: 'Admin' }
  const it = { email: 'it@m-piece.com', role: 'IT' }
  const otherIt = { email: 'other-it@m-piece.com', role: 'IT', hasLocalPassword: true }
  const agent = { email: 'agent@m-piece.com', role: 'Agent', hasLocalPassword: true }
  const anotherAdmin = { email: 'other-admin@m-piece.com', role: 'Admin', hasLocalPassword: true }

  assert.equal(canResetLocalPassword(admin, agent), true)
  assert.equal(canResetLocalPassword(admin, anotherAdmin), true)
  assert.equal(canResetLocalPassword(it, agent), true)
  assert.equal(canResetLocalPassword(it, otherIt), true)
  assert.equal(canResetLocalPassword(it, anotherAdmin), false)
  assert.equal(canResetLocalPassword(admin, { ...agent, hasLocalPassword: false }), false)
  assert.equal(canResetLocalPassword(admin, { ...agent, email: admin.email }), false)
  assert.equal(canResetLocalPassword(it, { ...agent, email: it.email }), false)
})
