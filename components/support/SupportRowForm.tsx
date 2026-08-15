'use client'

import { useState, type FormEvent } from 'react'
import { Bold, Italic, RotateCcw, X } from 'lucide-react'
import type { SupportCategory, SupportCellFormat, SupportRow } from '@/lib/support'

type Props = { category: SupportCategory; row?: SupportRow; busy: boolean; onCancel: () => void; onSubmit: (data: Record<string, string>, cellFormats: Record<string, SupportCellFormat>) => Promise<void> }

export default function SupportRowForm({ category, row, busy, onCancel, onSubmit }: Props) {
  const [data, setData] = useState<Record<string, string>>(() => Object.fromEntries(category.columns.map(column => [column.key, row?.data[column.key] || ''])))
  const [cellFormats, setCellFormats] = useState<Record<string, SupportCellFormat>>(() => ({ ...(row?.cellFormats || {}) }))
  const [error, setError] = useState<string | null>(null)
  const updateFormat = (key: string, updates: Partial<SupportCellFormat>) => {
    setCellFormats(current => {
      const next = { ...(current[key] || {}), ...updates }
      if (!next.color) delete next.color
      if (!next.bold) delete next.bold
      if (!next.italic) delete next.italic
      const result = { ...current }
      if (Object.keys(next).length > 0) result[key] = next
      else delete result[key]
      return result
    })
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null)
    try { await onSubmit(data, cellFormats) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Unable to save row') }
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
        <div className="flex justify-between gap-4"><div><h2 className="font-hanken text-2xl font-bold">{row ? 'Edit row' : 'Add row'}</h2><p className="text-sm text-on-surface-variant">{category.name}</p></div><button type="button" onClick={onCancel} className="rounded-lg p-2 hover:bg-surface-container-low"><X size={20} /></button></div>
        <div className="mt-5 space-y-5">{category.columns.map(column => {
          const format = cellFormats[column.key] || {}
          const inputId = `support-cell-${column.key}`
          return <div key={column.key}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={inputId} className="text-sm font-semibold">{column.label}</label>
              <div className="flex items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low/50 p-1" aria-label={`${column.label} text formatting`}>
                <button type="button" onClick={() => updateFormat(column.key, { bold: !format.bold })} aria-pressed={Boolean(format.bold)} title="Bold" className={`rounded p-1.5 ${format.bold ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-white'}`}><Bold size={15} /></button>
                <button type="button" onClick={() => updateFormat(column.key, { italic: !format.italic })} aria-pressed={Boolean(format.italic)} title="Italic" className={`rounded p-1.5 ${format.italic ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-white'}`}><Italic size={15} /></button>
                <label className="relative h-7 w-8 cursor-pointer overflow-hidden rounded border border-outline-variant bg-white" title="Text color"><span className="sr-only">{column.label} text color</span><input type="color" value={format.color || '#475569'} onChange={event => updateFormat(column.key, { color: event.target.value })} className="absolute -inset-2 h-11 w-12 cursor-pointer border-0 p-0" /></label>
                <button type="button" onClick={() => updateFormat(column.key, { color: undefined, bold: false, italic: false })} title="Clear formatting" className="rounded p-1.5 text-on-surface-variant hover:bg-white"><RotateCcw size={14} /></button>
              </div>
            </div>
            <textarea id={inputId} value={data[column.key]} onChange={event => setData(current => ({ ...current, [column.key]: event.target.value }))} rows={data[column.key]?.length > 100 || data[column.key]?.includes('\n') ? 5 : 2} placeholder="Enter text. Press Enter to add paragraph spacing." style={{ color: format.color, fontWeight: format.bold ? 700 : undefined, fontStyle: format.italic ? 'italic' : undefined }} className="w-full resize-y whitespace-pre-wrap rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary-container focus:ring-2 focus:ring-primary/40" />
          </div>
        })}</div>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-lg bg-primary-container px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save row'}</button></div>
      </form>
    </div>
  )
}
