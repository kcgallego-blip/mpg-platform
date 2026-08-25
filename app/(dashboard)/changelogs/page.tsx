'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, History, Loader2 } from 'lucide-react'
import ChangelogReleaseCard from '@/components/changelogs/ChangelogReleaseCard'
import { fetchChangelogPage } from '@/lib/changelogClient'
import type { ChangelogRelease } from '@/lib/changelog'

export default function ChangelogsPage() {
  const [releases, setReleases] = useState<ChangelogRelease[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = async (cursor: number | null, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true)
    setError(null)
    try {
      const page = await fetchChangelogPage(cursor)
      setReleases((current) => append ? [...current, ...page.items] : page.items)
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load changelogs')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadPage(null, false)
  }, [])

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-sm font-semibold text-primary-container">
          <History size={17} aria-hidden="true" />
          Release history
        </div>
        <h1 className="font-hanken text-headline-lg font-bold text-on-surface">Changelogs</h1>
        <p className="mt-2 max-w-2xl text-on-surface-variant">
          Review new features, improvements, and fixes released across the CLAD portal.
        </p>
      </header>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center" role="status">
          <div className="text-center text-on-surface-variant">
            <Loader2 size={34} className="mx-auto mb-3 animate-spin text-primary-container" />
            Loading release history…
          </div>
        </div>
      ) : error && releases.length === 0 ? (
        <div className="rounded-xl border border-error/30 bg-error-container p-6 text-center" role="alert">
          <AlertCircle size={30} className="mx-auto mb-3 text-error" />
          <p className="font-semibold text-error">{error}</p>
          <button
            type="button"
            onClick={() => void loadPage(null, false)}
            className="mt-4 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary-container"
          >
            Try again
          </button>
        </div>
      ) : releases.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-on-surface-variant">
          No changelogs have been published yet.
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {releases.map((release) => (
              <ChangelogReleaseCard key={release.sequence} release={release} />
            ))}
          </div>

          {error && (
            <p className="mt-4 text-center text-sm text-error" role="alert">{error}</p>
          )}

          {nextCursor !== null && (
            <div className="mt-8 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(nextCursor, true)}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={17} className="animate-spin" />}
                Load older releases
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
