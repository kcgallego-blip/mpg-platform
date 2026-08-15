'use client'

import { useState } from 'react'
import { FileUp, X } from 'lucide-react'
import type { SupportCategory } from '@/lib/support'
import { supportRequest } from '@/lib/supportClient'
import { parseSupportSpreadsheet, type SupportSpreadsheetRow } from '@/lib/supportSpreadsheet'

type Props = { category: SupportCategory; onCancel: () => void; onImported: () => Promise<void> }

export default function SupportCsvUpload({ category, onCancel, onImported }: Props) {
  const [headers, setHeaders] = useState<string[]>([])
  const [sourceRows, setSourceRows] = useState<SupportSpreadsheetRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectFile = async (file?: File) => {
    if (!file) return
    setError(null)
    try {
      const parsed = await parseSupportSpreadsheet(file)
      const nextMapping: Record<string, string> = {}
      category.columns.forEach(column => {
        const normalized = normalizeHeader(column.label)
        nextMapping[column.key] = parsed.headers.find(header => normalizeHeader(header) === normalized || normalizeHeader(header) === normalizeHeader(column.key)) || ''
      })
      setFileName(file.name); setHeaders(parsed.headers); setSourceRows(parsed.rows); setMapping(nextMapping)
    } catch (parseError) { setError(parseError instanceof Error ? parseError.message : 'Unable to read spreadsheet') }
  }

  const upload = async () => {
    const mappedColumns = Object.values(mapping).filter(Boolean)
    if (!mappedColumns.length) return setError('Map at least one spreadsheet header')
    if (new Set(mappedColumns).size !== mappedColumns.length) return setError('Each spreadsheet header can only be mapped once')
    setBusy(true); setError(null)
    try {
      const rows = sourceRows.map(source => ({
        data: Object.fromEntries(category.columns.map(column => [column.key, mapping[column.key] ? source.values[mapping[column.key]] || '' : ''])),
        cellFormats: Object.fromEntries(category.columns.flatMap(column => {
          const sourceHeader = mapping[column.key]
          const format = sourceHeader ? source.formats[sourceHeader] : undefined
          return format ? [[column.key, format]] : []
        })),
      }))
      await supportRequest(`/api/support/categories/${category.id}/import`, { method: 'POST', body: JSON.stringify({ rows }) })
      await onImported()
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Import failed'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-outline-variant bg-white p-6 shadow-2xl">
      <div className="flex justify-between gap-4"><div><h2 className="font-hanken text-2xl font-bold">Import spreadsheet</h2><p className="text-sm text-on-surface-variant">Map CSV, XLS, or XLSX headers into <strong>{category.name}</strong>. Excel text colors, bold, italic, and line breaks are preserved.</p></div><button onClick={onCancel} className="rounded-lg p-2 hover:bg-surface-container-low"><X size={20} /></button></div>
      <label className="mt-5 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low/40 px-6 py-7 text-center hover:border-primary-container"><FileUp size={28} className="mb-2 text-primary-container" /><span className="text-sm font-semibold">{fileName || 'Choose CSV or Excel file'}</span><span className="mt-1 text-xs text-on-surface-variant">Supported: .csv, .xls, .xlsx · first populated row is used as headers</span><input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void selectFile(event.target.files?.[0])} className="sr-only" /></label>
      {headers.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold">Header mapping</h3><div className="mt-2 overflow-hidden rounded-xl border border-outline-variant">{category.columns.map(column => <label key={column.key} className="grid grid-cols-2 items-center gap-4 border-b border-outline-variant px-4 py-3 text-sm last:border-0"><span className="font-semibold">{column.label}</span><select value={mapping[column.key] || ''} onChange={event => setMapping(current => ({ ...current, [column.key]: event.target.value }))} className="rounded-lg border border-outline-variant px-3 py-2"><option value="">Leave blank</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><p className="mt-2 text-xs text-on-surface-variant">{sourceRows.length.toLocaleString()} rows ready to import</p></div>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{error}</p>}
      <div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold">Cancel</button><button onClick={() => void upload()} disabled={busy || !sourceRows.length} className="rounded-lg bg-primary-container px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Importing…' : `Import ${sourceRows.length || ''} rows`}</button></div>
    </div></div>
  )
}

function normalizeHeader(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') }
