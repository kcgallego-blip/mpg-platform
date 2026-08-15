'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'
import { filterSupportRows, type SupportPayload } from '@/lib/support'
import { readSupportCache, writeSupportCache } from '@/lib/supportCache'
import { fetchSupportPayload, supportRequest } from '@/lib/supportClient'
import SupportSecondaryHeader from './SupportSecondaryHeader'
import SupportSearchBar from './SupportSearchBar'
import DynamicSupportTable from './DynamicSupportTable'

type VersionResponse = { version: number; latestUpdateTimestamp: string }

export default function AgentSupportView({ email }: { email: string }) {
  const [payload, setPayload] = useState<SupportPayload | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    let cached: SupportPayload | null = null
    try {
      cached = await readSupportCache(email)
      if (cached) setPayload(cached)
    } catch {
      // IndexedDB can be unavailable in privacy modes; the network path still works.
    }

    setLoading(!cached)
    setSyncing(Boolean(cached))
    try {
      const version = await supportRequest<VersionResponse>('/api/support/version')
      if (!cached || cached.version !== version.version || cached.latestUpdateTimestamp !== version.latestUpdateTimestamp) {
        const fresh = await fetchSupportPayload()
        setPayload(fresh)
        await writeSupportCache(email, fresh).catch(() => undefined)
      }
      setOffline(false)
    } catch (loadError) {
      setOffline(Boolean(cached))
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the knowledge base')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => { void load() }, [email]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const exists = payload?.categories.some(category => category.id === activeCategoryId)
    if (!exists) setActiveCategoryId(payload?.categories[0]?.id || '')
  }, [activeCategoryId, payload])

  const category = payload?.categories.find(item => item.id === activeCategoryId)
  const rows = useMemo(() => category ? filterSupportRows(category, query) : [], [category, query])

  if (loading) {
    return <LoadingState />
  }

  if (!payload) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <AlertTriangle size={38} className="mb-3 text-error" />
        <h1 className="font-hanken text-2xl font-bold">Knowledge base unavailable</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{error}</p>
        <button onClick={() => void load()} className="mt-5 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white">Try again</button>
      </div>
    )
  }

  if (!category) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-dashed border-outline-variant bg-white/60 text-center">
        <div><h1 className="font-hanken text-2xl font-bold">Knowledge base is ready</h1><p className="mt-2 text-on-surface-variant">A team leader has not added any categories yet.</p></div>
      </div>
    )
  }

  return (
    <>
      <SupportSecondaryHeader categories={payload.categories} activeCategoryId={activeCategoryId} onSelect={id => { setActiveCategoryId(id); setQuery('') }} />
      <SupportSearchBar value={query} onChange={setQuery} categoryName={category.name} resultCount={rows.length} totalCount={category.rows.length} />
      <div className="py-5">
        {(syncing || offline) && (
          <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${offline ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-primary-container'}`}>
            {offline ? <CloudOff size={15} /> : <RefreshCw size={15} className="animate-spin" />}
            {offline ? 'Offline: showing the latest saved copy on this device.' : 'Checking for knowledge-base updates…'}
          </div>
        )}
        <DynamicSupportTable category={category} rows={rows} />
        <p className="mt-3 text-right text-xs text-outline">Updated {new Date(payload.latestUpdateTimestamp).toLocaleString()}</p>
      </div>
    </>
  )
}

function LoadingState() {
  return <div className="flex min-h-[60vh] items-center justify-center" role="status"><div className="text-center"><div className="mx-auto mb-4 h-11 w-11 animate-spin rounded-full border-4 border-outline-variant border-t-primary-container" /><p className="text-sm text-on-surface-variant">Loading support references…</p></div></div>
}
