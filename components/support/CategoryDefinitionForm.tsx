'use client'

import { useState, type FormEvent } from 'react'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'
import { getNextSupportOrders, makeColumnKey, type CategoryInput, type SupportCategory, type SupportColumn } from '@/lib/support'

type Props = {
  category?: SupportCategory
  existingCategories: SupportCategory[]
  busy: boolean
  onCancel: () => void
  onSubmit: (input: CategoryInput) => Promise<void>
}

const blankColumn = (index: number): SupportColumn => ({ key: `column_${index}`, label: '', searchable: true, copyable: false })

export default function CategoryDefinitionForm({ category, existingCategories, busy, onCancel, onSubmit }: Props) {
  const nextOrders = getNextSupportOrders(existingCategories)
  const [name, setName] = useState(category?.name || '')
  const [columns, setColumns] = useState<SupportColumn[]>(category?.columns.map(column => ({ ...column })) || [blankColumn(1)])
  const [isQuickAccess, setIsQuickAccess] = useState(category?.isQuickAccess || false)
  const [quickAccessOrder, setQuickAccessOrder] = useState(category?.quickAccessOrder ?? nextOrders.quickTagOrder)
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? nextOrders.categoryOrder)
  const [error, setError] = useState<string | null>(null)

  const updateColumn = (index: number, updates: Partial<SupportColumn>) => {
    setColumns(current => current.map((column, columnIndex) => columnIndex === index ? { ...column, ...updates } : column))
  }

  const changeLabel = (index: number, label: string) => {
    setColumns(current => current.map((column, columnIndex) => {
      if (columnIndex !== index) return column
      const original = category?.columns[index]
      const shouldUpdateKey = !original || column.key === makeColumnKey(column.label) || column.label === ''
      return { ...column, label, key: shouldUpdateKey ? makeUniqueKey(makeColumnKey(label), current, index) : column.key }
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter a category name')
    if (columns.some(column => !column.label.trim())) return setError('Every column needs a name')
    const otherCategories = existingCategories.filter(item => item.id !== category?.id)
    if (otherCategories.some(item => item.sortOrder === sortOrder)) {
      return setError(`Category order ${sortOrder} is already used. Choose another order.`)
    }
    if (otherCategories.some(item => item.quickAccessOrder === quickAccessOrder)) {
      return setError(`Quick tag order ${quickAccessOrder} is already used. Choose another order.`)
    }
    try {
      await onSubmit({ name, columns, isQuickAccess, quickAccessOrder, sortOrder })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save category')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-hanken text-2xl font-bold text-on-surface">{category ? 'Edit category' : 'New category'}</h2><p className="mt-1 text-sm text-on-surface-variant">Define the table columns and how agents interact with them.</p></div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low" aria-label="Close"><X size={20} /></button>
        </div>

        <label className="mt-6 block text-sm font-semibold text-on-surface">Category name
          <input value={name} onChange={event => setName(event.target.value)} maxLength={80} className="mt-2 w-full rounded-lg border border-outline-variant px-3 py-2.5 font-normal outline-none focus:border-primary-container focus:ring-2 focus:ring-primary/40" placeholder="e.g. Billing & Payments" />
        </label>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between"><div><h3 className="text-sm font-bold text-on-surface">Columns</h3><p className="text-xs text-on-surface-variant">Search only scans selected columns. Copyable cells copy with one click.</p></div><button type="button" onClick={() => setColumns(current => [...current, blankColumn(current.length + 1)])} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-container px-3 py-2 text-xs font-semibold text-primary-container hover:bg-primary/20"><Plus size={15} /> Add column</button></div>
          <div className="overflow-hidden rounded-xl border border-outline-variant">
            <div className="grid grid-cols-[32px_minmax(180px,1fr)_110px_110px_40px] bg-surface-container-low px-2 py-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant"><span /><span>Column name</span><span className="text-center">Search</span><span className="text-center">Copy</span><span /></div>
            {columns.map((column, index) => (
              <div key={index} className="grid grid-cols-[32px_minmax(180px,1fr)_110px_110px_40px] items-center border-t border-outline-variant px-2 py-2">
                <GripVertical size={17} className="text-outline" />
                <div><input value={column.label} onChange={event => changeLabel(index, event.target.value)} maxLength={80} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary-container" placeholder="Column name" /><p className="mt-1 truncate font-mono text-[10px] text-outline">{column.key}</p></div>
                <label className="flex justify-center"><input type="checkbox" checked={column.searchable} onChange={event => updateColumn(index, { searchable: event.target.checked })} className="h-4 w-4 accent-[#34518d]" aria-label={`Search ${column.label}`} /></label>
                <label className="flex justify-center"><input type="checkbox" checked={column.copyable} onChange={event => updateColumn(index, { copyable: event.target.checked })} className="h-4 w-4 accent-[#34518d]" aria-label={`Copy ${column.label}`} /></label>
                <button type="button" disabled={columns.length === 1} onClick={() => setColumns(current => current.filter((_, columnIndex) => columnIndex !== index))} className="rounded-md p-2 text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Remove ${column.label || 'column'}`}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={isQuickAccess} onChange={event => setIsQuickAccess(event.target.checked)} className="h-4 w-4 accent-[#34518d]" /> Quick-access tag</label>
          <label className="text-xs font-semibold text-on-surface-variant">Quick tag order<input type="number" min={0} max={32767} value={quickAccessOrder} onChange={event => setQuickAccessOrder(Number(event.target.value))} disabled={!isQuickAccess} className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface disabled:opacity-50" /></label>
          <label className="text-xs font-semibold text-on-surface-variant">Category order<input type="number" min={0} max={2147483647} value={sortOrder} onChange={event => setSortOrder(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface" /></label>
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-lg bg-primary-container px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save category'}</button></div>
      </form>
    </div>
  )
}

function makeUniqueKey(base: string, columns: SupportColumn[], currentIndex: number) {
  let key = base
  let suffix = 2
  while (columns.some((column, index) => index !== currentIndex && column.key === key)) {
    key = `${base.slice(0, 60)}_${suffix++}`
  }
  return key
}
