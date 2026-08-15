'use client'

import type { CategoryInput, SupportCellFormat, SupportPayload } from './support'

type ApiError = { error?: string }

export async function supportRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const result = await response.json().catch(() => null) as T & ApiError | null
  if (!response.ok || !result) throw new Error(result?.error || 'Support request failed')
  return result
}

export function fetchSupportPayload() {
  return supportRequest<SupportPayload>('/api/support/payload')
}

export function createSupportCategory(input: CategoryInput) {
  return supportRequest('/api/support/categories', { method: 'POST', body: JSON.stringify(input) })
}

export function updateSupportCategory(id: string, input: CategoryInput) {
  return supportRequest(`/api/support/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteSupportCategory(id: string) {
  return supportRequest(`/api/support/categories/${id}`, { method: 'DELETE' })
}

export function createSupportRow(categoryId: string, data: Record<string, string>, cellFormats: Record<string, SupportCellFormat>) {
  return supportRequest(`/api/support/categories/${categoryId}/rows`, {
    method: 'POST', body: JSON.stringify({ data, cellFormats }),
  })
}

export function updateSupportRow(rowId: string, data: Record<string, string>, cellFormats: Record<string, SupportCellFormat>) {
  return supportRequest(`/api/support/rows/${rowId}`, {
    method: 'PATCH', body: JSON.stringify({ data, cellFormats }),
  })
}

export function deleteSupportRow(rowId: string) {
  return supportRequest(`/api/support/rows/${rowId}`, { method: 'DELETE' })
}

export function deleteSupportRows(rowIds: string[]) {
  return supportRequest<{ deleted: number }>('/api/support/rows', {
    method: 'DELETE', body: JSON.stringify({ rowIds }),
  })
}
