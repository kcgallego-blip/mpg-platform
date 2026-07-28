export const SUGGESTION_MAX_LENGTH = 5000

export type SuggestionsRole = 'Agent' | 'Admin'

export function isSuggestionsRole(role: string | null | undefined): role is SuggestionsRole {
  return role === 'Agent' || role === 'Admin'
}

export function validateSuggestion(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { error: 'Suggestion content is required', value: null }
  }

  const suggestion = value.trim()

  if (suggestion.length > SUGGESTION_MAX_LENGTH) {
    return {
      error: `Suggestion content must be ${SUGGESTION_MAX_LENGTH.toLocaleString()} characters or fewer`,
      value: null,
    }
  }

  return { error: null, value: suggestion }
}
