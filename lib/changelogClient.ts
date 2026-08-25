'use client'

import type { ChangelogPage, ChangelogRelease, ChangelogStatus } from './changelog'

type ApiError = { error?: string }

async function changelogRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const result = await response.json().catch(() => null) as (T & ApiError) | null

  if (!response.ok || !result) {
    throw new Error(result?.error || 'Unable to load changelogs')
  }

  return result
}

export function fetchChangelogStatus() {
  return changelogRequest<ChangelogStatus>('/api/changelogs/status', {
    cache: 'no-store',
  })
}

export function fetchUnseenChangelogs(afterSequence: number) {
  return changelogRequest<ChangelogPage>(`/api/changelogs?after=${afterSequence}`, {
    cache: 'no-store',
  })
}

export function fetchChangelogPage(cursor: number | null, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor !== null) params.set('cursor', String(cursor))
  return changelogRequest<ChangelogPage>(`/api/changelogs?${params}`)
}

export function acknowledgeChangelogs(sequence: number) {
  return changelogRequest<{ lastSeenSequence: number }>('/api/changelogs/acknowledgements', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ sequence }),
  })
}

export type { ChangelogRelease }
