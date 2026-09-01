export const MIN_PASSWORD_LENGTH = 10
export const STRONG_PASSWORD_LENGTH = 14
export const REQUIRED_CHARACTER_TYPE_COUNT = 3

export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong'

export type PasswordEvaluation = {
  lengthValid: boolean
  hasLowercase: boolean
  hasUppercase: boolean
  hasNumber: boolean
  hasSymbol: boolean
  characterTypeCount: number
  characterTypesValid: boolean
  valid: boolean
  strength: PasswordStrength
  score: 0 | 1 | 2 | 3 | 4
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const hasLowercase = /[a-z]/.test(password)
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const characterTypeCount = [hasLowercase, hasUppercase, hasNumber, hasSymbol]
    .filter(Boolean).length
  const lengthValid = password.length >= MIN_PASSWORD_LENGTH
  const characterTypesValid = characterTypeCount >= REQUIRED_CHARACTER_TYPE_COUNT
  const valid = lengthValid && characterTypesValid

  let score: PasswordEvaluation['score'] = 0
  let strength: PasswordStrength = 'empty'

  if (password.length > 0) {
    score = 1
    strength = 'weak'
  }

  if (password.length >= 8 && characterTypeCount >= 2) {
    score = 2
    strength = 'fair'
  }

  if (valid) {
    score = 3
    strength = 'good'
  }

  if (password.length >= STRONG_PASSWORD_LENGTH && characterTypeCount === 4) {
    score = 4
    strength = 'strong'
  }

  return {
    lengthValid,
    hasLowercase,
    hasUppercase,
    hasNumber,
    hasSymbol,
    characterTypeCount,
    characterTypesValid,
    valid,
    strength,
    score,
  }
}

export function getPasswordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required'

  const evaluation = evaluatePassword(password)

  if (!evaluation.lengthValid) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }

  if (!evaluation.characterTypesValid) {
    return 'Password must include at least three of: lowercase, uppercase, number, and symbol'
  }

  return null
}

export function passwordsMatch(password: string, confirmPassword: string) {
  return confirmPassword.length > 0 && password === confirmPassword
}
