'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Inbox, Lightbulb, Send, ShieldX, XCircle } from 'lucide-react'
import { SUGGESTION_MAX_LENGTH, type SuggestionsRole, isSuggestionsRole } from '@/lib/suggestions'

type Suggestion = {
  agent: string
  created_at: string
  suggest: string | null
}

type Toast = {
  kind: 'success' | 'error'
  message: string
}

export default function SuggestionsPage() {
  const [role, setRole] = useState<SuggestionsRole | 'Unauthorized' | null>(null)
  const [suggestion, setSuggestion] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  const loadAdminSuggestions = useCallback(async () => {
    const response = await fetch('/api/suggestions', { cache: 'no-store' })
    const data = (await response.json()) as { suggestions?: Suggestion[]; error?: string }

    if (!response.ok) {
      throw new Error(data.error || 'Unable to load suggestions')
    }

    setSuggestions(data.suggestions || [])
  }, [])

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      try {
        setIsLoading(true)
        setError('')

        const response = await fetch('/api/auth/me', { cache: 'no-store' })
        const data = (await response.json()) as { role?: string | null; error?: string }

        if (!response.ok) {
          throw new Error(data.error || 'Unable to verify access')
        }

        if (!isSuggestionsRole(data.role)) {
          if (isMounted) setRole('Unauthorized')
          return
        }

        if (isMounted) setRole(data.role)

        if (data.role === 'Admin') {
          await loadAdminSuggestions()
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load suggestions')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [loadAdminSuggestions])

  useEffect(() => {
    if (!toast) return

    const timeout = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const value = suggestion.trim()
    if (!value) {
      setToast({ kind: 'error', message: 'Please enter a suggestion before submitting.' })
      return
    }

    if (value.length > SUGGESTION_MAX_LENGTH) {
      setToast({
        kind: 'error',
        message: `Suggestions must be ${SUGGESTION_MAX_LENGTH.toLocaleString()} characters or fewer.`,
      })
      return
    }

    try {
      setIsSubmitting(true)
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggest: value }),
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit suggestion')
      }

      setSuggestion('')
      setToast({ kind: 'success', message: 'Your suggestion was submitted successfully.' })
    } catch (submitError) {
      setToast({
        kind: 'error',
        message: submitError instanceof Error ? submitError.message : 'Unable to submit suggestion',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center" role="status">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
          <p className="text-on-surface-variant">Loading suggestions...</p>
        </div>
      </div>
    )
  }

  if (role === 'Unauthorized') {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="max-w-md rounded-2xl border border-error/20 bg-white/80 p-8 text-center shadow-sm">
          <ShieldX size={40} className="mx-auto mb-4 text-error" />
          <h1 className="font-hanken text-2xl font-bold text-on-surface">Unauthorized</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Suggestions are available only to users with the Agent or Admin role.
          </p>
          <Link
            href="/staffing"
            className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90"
          >
            Return to Staffing
          </Link>
        </div>
      </div>
    )
  }

  if (error || !role) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/10 px-5 py-4 text-error">
        {error || 'Unable to verify Suggestions access.'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-label-md font-semibold uppercase text-primary-container">
          Suggestions Board
        </p>
        <h1 className="font-hanken text-headline-lg font-bold text-on-surface">
          {role === 'Agent' ? 'Share an idea' : 'Submitted suggestions'}
        </h1>
        <p className="mt-2 max-w-2xl text-on-surface-variant">
          {role === 'Agent'
            ? 'Tell the team what could make our this web portal better.'
            : 'Review ideas submitted by agents, with the newest entries shown first.'}
        </p>
      </div>

      {role === 'Agent' ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-outline-variant/60 bg-white/90 p-6 shadow-sm"
        >
          <label htmlFor="suggestion" className="font-hanken text-lg font-bold text-on-surface">
            Your suggestion
          </label>
          <p id="suggestion-help" className="mt-1 text-sm text-on-surface-variant">
            Be as specific as you can. Your account email is attached automatically.
          </p>
          <textarea
            id="suggestion"
            value={suggestion}
            onChange={(event) => setSuggestion(event.target.value)}
            aria-describedby="suggestion-help suggestion-count"
            rows={8}
            maxLength={SUGGESTION_MAX_LENGTH}
            disabled={isSubmitting}
            placeholder="Describe your suggestion..."
            className="mt-4 w-full resize-y rounded-xl border border-outline-variant bg-white px-4 py-3 text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span id="suggestion-count" className="text-sm text-on-surface-variant">
              {suggestion.length.toLocaleString()} / {SUGGESTION_MAX_LENGTH.toLocaleString()}
            </span>
            <button
              type="submit"
              disabled={isSubmitting || suggestion.trim().length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={18} />
              {isSubmitting ? 'Submitting...' : 'Submit suggestion'}
            </button>
          </div>
        </form>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-outline-variant/60 bg-white/90 shadow-sm">
          {suggestions.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <Inbox size={40} className="mb-4 text-on-surface-variant" />
              <h2 className="font-hanken text-xl font-bold text-on-surface">No suggestions yet</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                Agent submissions will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-outline-variant/60 bg-surface-variant/40">
                    <th className="w-64 px-6 py-4 text-left text-label-md font-semibold text-on-surface">Agent Email</th>
                    <th className="w-56 px-6 py-4 text-left text-label-md font-semibold text-on-surface">Timestamp</th>
                    <th className="px-6 py-4 text-left text-label-md font-semibold text-on-surface">Suggestion Content</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((item) => (
                    <tr
                      key={`${item.agent}-${item.created_at}`}
                      className="border-b border-outline-variant/30 align-top last:border-b-0 hover:bg-surface-variant/20"
                    >
                      <td className="px-6 py-4 font-medium text-on-surface">{item.agent}</td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        <time dateTime={item.created_at}>
                          {new Intl.DateTimeFormat('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(item.created_at))}
                        </time>
                      </td>
                      <td className="whitespace-pre-wrap break-words px-6 py-4 text-on-surface">
                        {item.suggest || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg ${
            toast.kind === 'success'
              ? 'border-emerald-200 text-emerald-700'
              : 'border-error/30 text-error'
          }`}
        >
          {toast.kind === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  )
}
