export type SupportColumn = {
  key: string
  label: string
  searchable: boolean
  copyable: boolean
}

export type SupportCellFormat = {
  color?: string
  bold?: boolean
  italic?: boolean
}

export type SupportRow = {
  id: string
  categoryId: string
  data: Record<string, string>
  cellFormats: Record<string, SupportCellFormat>
  createdAt: string
  updatedAt: string
}

export type SupportCategory = {
  id: string
  name: string
  columns: SupportColumn[]
  isQuickAccess: boolean
  quickAccessOrder: number
  sortOrder: number
  createdAt: string
  updatedAt: string
  rows: SupportRow[]
}

export type SupportPayload = {
  version: number
  latestUpdateTimestamp: string
  categories: SupportCategory[]
}

export type CategoryInput = {
  name: string
  columns: SupportColumn[]
  isQuickAccess?: boolean
  quickAccessOrder?: number
  sortOrder?: number
}

export function getNextSupportOrders(categories: SupportCategory[]) {
  const highestCategoryOrder = categories.reduce(
    (highest, category) => Math.max(highest, category.sortOrder),
    -1
  )
  const highestQuickTagOrder = categories.reduce(
    (highest, category) => Math.max(highest, category.quickAccessOrder),
    -1
  )
  return {
    categoryOrder: highestCategoryOrder + 1,
    quickTagOrder: highestQuickTagOrder + 1,
  }
}

const MAX_COLUMNS = 50
const MAX_CELL_LENGTH = 20_000
const COLUMN_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

export function isAgentRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() === 'agent'
}

export function canManageSupport(role: string | null | undefined) {
  return Boolean(role?.trim()) && !isAgentRole(role)
}

export function makeColumnKey(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)

  return /^[a-z]/.test(base) ? base : `column_${base || 'value'}`.slice(0, 64)
}

export function validateCategoryInput(value: unknown):
  | { value: Required<CategoryInput>; error?: never }
  | { value?: never; error: string } {
  if (!value || typeof value !== 'object') return { error: 'Category details are required' }

  const input = value as Partial<CategoryInput>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 80) return { error: 'Category name must be between 1 and 80 characters' }
  if (!Array.isArray(input.columns) || input.columns.length === 0 || input.columns.length > MAX_COLUMNS) {
    return { error: `Define between 1 and ${MAX_COLUMNS} columns` }
  }

  const keys = new Set<string>()
  const columns: SupportColumn[] = []
  for (const candidate of input.columns) {
    if (!candidate || typeof candidate !== 'object') return { error: 'Every column must be an object' }
    const column = candidate as Partial<SupportColumn>
    const label = typeof column.label === 'string' ? column.label.trim() : ''
    const key = typeof column.key === 'string' ? column.key.trim().toLowerCase() : ''

    if (!label || label.length > 80) return { error: 'Column labels must be between 1 and 80 characters' }
    if (!COLUMN_KEY_PATTERN.test(key)) return { error: `Invalid column key: ${key || '(empty)'}` }
    if (keys.has(key)) return { error: `Duplicate column key: ${key}` }
    keys.add(key)
    columns.push({
      key,
      label,
      searchable: column.searchable === true,
      copyable: column.copyable === true,
    })
  }

  return {
    value: {
      name,
      columns,
      isQuickAccess: input.isQuickAccess === true,
      quickAccessOrder: clampInteger(input.quickAccessOrder, 0, 32_767, 0),
      sortOrder: clampInteger(input.sortOrder, 0, 2_147_483_647, 0),
    },
  }
}

export function normalizeRowData(
  value: unknown,
  columns: SupportColumn[]
): { value?: Record<string, string>; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Row data must be an object' }
  }

  const source = value as Record<string, unknown>
  const data: Record<string, string> = {}
  for (const column of columns) {
    const raw = source[column.key]
    if (raw === null || raw === undefined) {
      data[column.key] = ''
      continue
    }
    if (!['string', 'number', 'boolean'].includes(typeof raw)) {
      return { error: `${column.label} must be text, a number, or a boolean` }
    }
    const cell = String(raw).replace(/\r\n?/g, '\n')
    if (cell.length > MAX_CELL_LENGTH) {
      return { error: `${column.label} exceeds ${MAX_CELL_LENGTH.toLocaleString()} characters` }
    }
    data[column.key] = cell
  }

  return { value: data }
}

export function normalizeCellFormats(
  value: unknown,
  columns: SupportColumn[]
): { value?: Record<string, SupportCellFormat>; error?: string } {
  if (value === null || value === undefined) return { value: {} }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Cell formatting must be an object' }
  }

  const source = value as Record<string, unknown>
  const formats: Record<string, SupportCellFormat> = {}
  for (const column of columns) {
    const raw = source[column.key]
    if (raw === null || raw === undefined) continue
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: `${column.label} formatting must be an object` }
    }
    const candidate = raw as Record<string, unknown>
    const format: SupportCellFormat = {}
    if (candidate.color !== undefined && candidate.color !== '') {
      if (typeof candidate.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(candidate.color)) {
        return { error: `${column.label} text color must use #RRGGBB format` }
      }
      format.color = candidate.color.toUpperCase()
    }
    if (candidate.bold === true) format.bold = true
    if (candidate.italic === true) format.italic = true
    if (Object.keys(format).length > 0) formats[column.key] = format
  }
  return { value: formats }
}

export function filterSupportRows(category: SupportCategory, query: string) {
  const search = query.trim().toLocaleLowerCase()
  if (!search) return category.rows
  const keys = category.columns.filter(column => column.searchable).map(column => column.key)
  if (keys.length === 0) return []
  return category.rows.filter(row =>
    keys.some(key => (row.data[key] || '').toLocaleLowerCase().includes(search))
  )
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
