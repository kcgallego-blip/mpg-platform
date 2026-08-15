'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileUp, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { CategoryInput, SupportCategory, SupportCellFormat, SupportPayload, SupportRow } from '@/lib/support'
import { filterSupportRows } from '@/lib/support'
import {
  createSupportCategory,
  createSupportRow,
  deleteSupportCategory,
  deleteSupportRows,
  fetchSupportPayload,
  updateSupportCategory,
  updateSupportRow,
} from '@/lib/supportClient'
import CategoryDefinitionForm from './CategoryDefinitionForm'
import DynamicSupportTable from './DynamicSupportTable'
import SupportCsvUpload from './SupportCsvUpload'
import SupportRowForm from './SupportRowForm'
import SupportSearchBar from './SupportSearchBar'
import SupportSecondaryHeader from './SupportSecondaryHeader'

type Modal =
  | { type: 'category'; category?: SupportCategory }
  | { type: 'row'; row?: SupportRow }
  | { type: 'csv' }
  | null

export default function ManagerSupportView() {
  const [payload, setPayload] = useState<SupportPayload | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  const refresh = async () => {
    setError(null)
    try {
      const fresh = await fetchSupportPayload()
      setPayload(fresh)
      setActiveCategoryId(current => fresh.categories.some(category => category.id === current) ? current : fresh.categories[0]?.id || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load support data')
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const category = payload?.categories.find(item => item.id === activeCategoryId)
  const rows = useMemo(() => category ? filterSupportRows(category, query) : [], [category, query])

  const saveCategory = async (input: CategoryInput) => {
    setBusy(true)
    try {
      if (modal?.type === 'category' && modal.category) await updateSupportCategory(modal.category.id, input)
      else await createSupportCategory(input)
      setModal(null); await refresh()
    } finally { setBusy(false) }
  }

  const saveRow = async (data: Record<string, string>, cellFormats: Record<string, SupportCellFormat>) => {
    if (!category) return
    setBusy(true)
    try {
      if (modal?.type === 'row' && modal.row) await updateSupportRow(modal.row.id, data, cellFormats)
      else await createSupportRow(category.id, data, cellFormats)
      setModal(null); await refresh()
    } finally { setBusy(false) }
  }

  const removeCategory = async () => {
    if (!category || !window.confirm(`Delete “${category.name}” and all ${category.rows.length} rows? This cannot be undone.`)) return
    setBusy(true)
    try { await deleteSupportCategory(category.id); setActiveCategoryId(''); setSelectedRowIds(new Set()); await refresh() }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete category') }
    finally { setBusy(false) }
  }

  const removeSelectedRows = async () => {
    const rowIds = Array.from(selectedRowIds)
    if (rowIds.length === 0) return
    if (!window.confirm(`Delete ${rowIds.length} selected support row${rowIds.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteSupportRows(rowIds)
      setSelectedRowIds(new Set())
      await refresh()
    }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete selected rows') }
    finally { setBusy(false) }
  }

  const toggleRow = (rowId: string, selected: boolean) => {
    setSelectedRowIds(current => {
      const next = new Set(current)
      if (selected) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  const toggleAllVisibleRows = (rowIds: string[], selected: boolean) => {
    setSelectedRowIds(current => {
      const next = new Set(current)
      rowIds.forEach(rowId => selected ? next.add(rowId) : next.delete(rowId))
      return next
    })
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><RefreshCw className="animate-spin text-primary-container" size={34} /></div>

  return (
    <>
      {payload && payload.categories.length > 0 && <SupportSecondaryHeader categories={payload.categories} activeCategoryId={activeCategoryId} onSelect={id => { setActiveCategoryId(id); setQuery(''); setSelectedRowIds(new Set()) }} />}
      <div className="py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-container">Management view</p><h1 className="font-hanken text-3xl font-bold text-on-surface">Support content</h1><p className="mt-1 text-sm text-on-surface-variant">Changes automatically publish a new revision for agent caches.</p></div>
          <div className="flex flex-wrap gap-2">
            {category && <><button onClick={() => setModal({ type: 'csv' })} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-3.5 py-2 text-sm font-semibold hover:border-primary-container"><FileUp size={17} /> Import file</button><button onClick={() => setModal({ type: 'category', category })} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-3.5 py-2 text-sm font-semibold hover:border-primary-container"><Pencil size={16} /> Edit category</button><button disabled={busy} onClick={() => void removeCategory()} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-semibold text-error hover:bg-red-50"><Trash2 size={16} /> Delete</button></>}
            <button onClick={() => setModal({ type: 'category' })} className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white"><Plus size={17} /> New category</button>
          </div>
        </div>

        {error && <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-error"><span>{error}</span><button onClick={() => void refresh()} className="font-semibold underline">Retry</button></div>}

        {!category ? (
          <button onClick={() => setModal({ type: 'category' })} className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-white/60 text-center hover:border-primary-container"><Plus size={36} className="mb-3 text-primary-container" /><span className="font-hanken text-xl font-bold">Create the first category</span><span className="mt-1 text-sm text-on-surface-variant">Define its columns, search behavior, and copyable cells.</span></button>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between"><div><h2 className="font-hanken text-xl font-bold">{category.name}</h2><p className="text-xs text-on-surface-variant">{category.columns.length} columns · {category.rows.length} rows</p></div><button onClick={() => setModal({ type: 'row' })} className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white"><Plus size={17} /> Add row</button></div>
            <SupportSearchBar value={query} onChange={setQuery} categoryName={category.name} resultCount={rows.length} totalCount={category.rows.length} />
            {selectedRowIds.size > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-container/20 bg-blue-50 px-4 py-3">
                <p className="text-sm font-semibold text-primary-container">{selectedRowIds.size} row{selectedRowIds.size === 1 ? '' : 's'} selected</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedRowIds(new Set())} disabled={busy} className="rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm font-semibold text-on-surface-variant disabled:opacity-50">Clear selection</button>
                  <button type="button" onClick={() => void removeSelectedRows()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Trash2 size={16} /> {busy ? 'Deleting…' : 'Delete selected'}</button>
                </div>
              </div>
            )}
            <div className="mt-4"><DynamicSupportTable category={category} rows={rows} selection={{ selectedRowIds, onToggleRow: toggleRow, onToggleAll: toggleAllVisibleRows }} actions={row => <button onClick={() => setModal({ type: 'row', row })} className="rounded-md p-2 text-primary-container hover:bg-primary/20" aria-label="Edit row"><Pencil size={16} /></button>} /></div>
          </>
        )}
      </div>

      {modal?.type === 'category' && <CategoryDefinitionForm category={modal.category} existingCategories={payload?.categories || []} busy={busy} onCancel={() => setModal(null)} onSubmit={saveCategory} />}
      {modal?.type === 'row' && category && <SupportRowForm category={category} row={modal.row} busy={busy} onCancel={() => setModal(null)} onSubmit={saveRow} />}
      {modal?.type === 'csv' && category && <SupportCsvUpload category={category} onCancel={() => setModal(null)} onImported={async () => { setModal(null); await refresh() }} />}
    </>
  )
}
