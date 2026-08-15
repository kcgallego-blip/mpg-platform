'use client'

import { useState } from 'react'
import { Check, Clipboard, Database } from 'lucide-react'
import type { SupportCategory, SupportRow } from '@/lib/support'

type Props = {
  category: SupportCategory
  rows: SupportRow[]
  actions?: (row: SupportRow) => React.ReactNode
  selection?: {
    selectedRowIds: Set<string>
    onToggleRow: (rowId: string, selected: boolean) => void
    onToggleAll: (rowIds: string[], selected: boolean) => void
  }
}

export default function DynamicSupportTable({ category, rows, actions, selection }: Props) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null)
  const allVisibleSelected = Boolean(selection && rows.length > 0 && rows.every(row => selection.selectedRowIds.has(row.id)))
  const someVisibleSelected = Boolean(selection && rows.some(row => selection.selectedRowIds.has(row.id)))

  const copyCell = async (rowId: string, key: string, value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      const cell = `${rowId}:${key}`
      setCopiedCell(cell)
      window.setTimeout(() => setCopiedCell(current => current === cell ? null : current), 1200)
    } catch {
      setCopiedCell(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-white/60 px-6 text-center">
        <Database size={34} className="mb-3 text-outline" />
        <h2 className="font-hanken text-lg font-semibold text-on-surface">No matching reference rows</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Try another search or choose a different category.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
      <div className="max-h-[calc(100vh-270px)] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-container-low">
            <tr>
              {selection && (
                <th scope="col" className="w-12 border-b border-outline-variant px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={element => { if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected }}
                    onChange={event => selection.onToggleAll(rows.map(row => row.id), event.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[#34518d]"
                    aria-label="Select all visible rows"
                  />
                </th>
              )}
              {category.columns.map(column => (
                <th key={column.key} scope="col" className="whitespace-nowrap border-b border-outline-variant px-4 py-3 font-hanken font-bold text-on-surface">
                  <span className="inline-flex items-center gap-1.5">
                    {column.label}
                    {column.copyable && <Clipboard size={13} className="text-primary-container" aria-label="Click cells to copy" />}
                  </span>
                </th>
              ))}
              {actions && <th className="sticky right-0 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className={selection?.selectedRowIds.has(row.id) ? 'bg-blue-50' : rowIndex % 2 ? 'bg-surface-container-low/30' : 'bg-white'}>
                {selection && (
                  <td className="w-12 border-b border-outline-variant/70 px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selection.selectedRowIds.has(row.id)}
                      onChange={event => selection.onToggleRow(row.id, event.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[#34518d]"
                      aria-label="Select row"
                    />
                  </td>
                )}
                {category.columns.map(column => {
                  const value = row.data[column.key] || ''
                  const format = row.cellFormats?.[column.key] || {}
                  const cellId = `${row.id}:${column.key}`
                  return (
                    <td key={column.key} className="max-w-[420px] whitespace-pre-wrap break-words border-b border-outline-variant/70 px-4 py-3 align-top text-on-surface-variant">
                      {column.copyable ? (
                        <button
                          type="button"
                          onClick={() => void copyCell(row.id, column.key, value)}
                          disabled={!value}
                          title={value ? 'Copy to clipboard' : undefined}
                          className="group inline-flex max-w-full items-start gap-2 whitespace-pre-wrap text-left transition hover:opacity-80 disabled:cursor-default"
                          style={{ color: format.color, fontWeight: format.bold ? 700 : undefined, fontStyle: format.italic ? 'italic' : undefined }}
                        >
                          <span>{value || <span className="text-outline">—</span>}</span>
                          {value && (copiedCell === cellId
                            ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                            : <Clipboard size={14} className="mt-0.5 shrink-0 opacity-0 transition group-hover:opacity-100" />)}
                        </button>
                      ) : <span style={{ color: format.color, fontWeight: format.bold ? 700 : undefined, fontStyle: format.italic ? 'italic' : undefined }}>{value || <span className="text-outline">—</span>}</span>}
                    </td>
                  )
                })}
                {actions && <td className="sticky right-0 whitespace-nowrap border-b border-outline-variant/70 bg-inherit px-4 py-3 text-right">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
