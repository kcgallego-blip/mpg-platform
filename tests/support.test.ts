import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import * as CFB from 'cfb'
import type { CFB$Container } from 'cfb'
import {
  canManageSupport,
  filterSupportRows,
  getNextSupportOrders,
  makeColumnKey,
  normalizeCellFormats,
  normalizeRowData,
  validateCategoryInput,
  type SupportCategory,
} from '../lib/support.ts'
import { parseSupportSpreadsheet } from '../lib/supportSpreadsheet.ts'

test('support role branching treats only assigned non-agents as managers', () => {
  assert.equal(canManageSupport('Agent'), false)
  assert.equal(canManageSupport(' agent '), false)
  assert.equal(canManageSupport('Team Leader'), true)
  assert.equal(canManageSupport('Admin'), true)
  assert.equal(canManageSupport(null), false)
})

test('new support categories default to one above the highest existing orders', () => {
  const category = (id: string, sortOrder: number, quickAccessOrder: number, isQuickAccess: boolean): SupportCategory => ({
    id, name: id, columns: [], rows: [], sortOrder, quickAccessOrder, isQuickAccess,
    createdAt: '', updatedAt: '',
  })
  assert.deepEqual(getNextSupportOrders([]), { categoryOrder: 0, quickTagOrder: 0 })
  assert.deepEqual(getNextSupportOrders([
    category('not-quick', 7, 99, false),
    category('quick-one', 3, 2, true),
    category('quick-two', 5, 6, true),
  ]), { categoryOrder: 8, quickTagOrder: 100 })
})

test('category schemas generate stable keys and reject duplicates', () => {
  assert.equal(makeColumnKey('Account / PIN'), 'account_pin')
  const valid = validateCategoryInput({
    name: 'Accounts',
    columns: [{ key: 'account_pin', label: 'Account / PIN', searchable: true, copyable: true }],
  })
  assert.ok(valid.value)

  const duplicate = validateCategoryInput({
    name: 'Accounts',
    columns: [
      { key: 'account', label: 'Account', searchable: true, copyable: false },
      { key: 'account', label: 'Account again', searchable: false, copyable: false },
    ],
  })
  assert.match(duplicate.error || '', /Duplicate column key/)
})

test('row normalization drops unknown JSON keys and search uses selected columns only', () => {
  const columns = [
    { key: 'topic', label: 'Topic', searchable: true, copyable: false },
    { key: 'private_note', label: 'Private note', searchable: false, copyable: false },
  ]
  const normalized = normalizeRowData({ topic: ' Refunds ', private_note: 123, ignored: 'value' }, columns)
  assert.deepEqual(normalized.value, { topic: ' Refunds ', private_note: '123' })

  const formatting = normalizeCellFormats({
    topic: { color: '#ff0000', bold: true, italic: true },
    ignored: { color: '#ffffff' },
  }, columns)
  assert.deepEqual(formatting.value, { topic: { color: '#FF0000', bold: true, italic: true } })
  assert.match(normalizeCellFormats({ topic: { color: 'red' } }, columns).error || '', /#RRGGBB/)

  const category: SupportCategory = {
    id: 'category', name: 'Billing', columns, isQuickAccess: true, quickAccessOrder: 0,
    sortOrder: 0, createdAt: '', updatedAt: '',
    rows: [{ id: 'row', categoryId: 'category', data: normalized.value!, cellFormats: formatting.value!, createdAt: '', updatedAt: '' }],
  }
  assert.equal(filterSupportRows(category, 'refund').length, 1)
  assert.equal(filterSupportRows(category, '123').length, 0)
})

test('spreadsheet parsing accepts CSV and legacy XLS while preserving line breaks', async () => {
  const csv = new File(['Topic,Steps\nReset,"First step\n\nSecond step"'], 'support.csv', { type: 'text/csv' })
  const parsedCsv = await parseSupportSpreadsheet(csv)
  assert.deepEqual(parsedCsv.headers, ['Topic', 'Steps'])
  assert.equal(parsedCsv.rows[0].values.Steps, 'First step\n\nSecond step')

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Topic', 'Steps'], ['Login', 'One\nTwo']]), 'Support')
  const legacyBytes = XLSX.write(workbook, { type: 'array', bookType: 'biff8' })
  const parsedXls = await parseSupportSpreadsheet(new File([legacyBytes], 'support.xls', { type: 'application/vnd.ms-excel' }))
  assert.equal(parsedXls.rows[0].values.Topic, 'Login')
  assert.equal(parsedXls.rows[0].values.Steps, 'One\nTwo')

  const legacyWorkbook = XLSX.read(legacyBytes, { type: 'array', bookFiles: true }) as XLSX.WorkBook & { cfb: CFB$Container }
  const workbookStream = legacyWorkbook.cfb.FileIndex.find(entry => entry.name === 'Workbook')!.content as Uint8Array
  const view = new DataView(workbookStream.buffer, workbookStream.byteOffset, workbookStream.byteLength)
  for (let offset = 0; offset + 4 <= view.byteLength;) {
    const recordType = view.getUint16(offset, true)
    const length = view.getUint16(offset + 2, true)
    if (recordType === 0x0031) {
      view.setUint16(offset + 6, 0x0002, true) // italic
      view.setUint16(offset + 8, 0x0002, true) // red palette entry
      view.setUint16(offset + 10, 700, true) // bold
      break
    }
    offset += 4 + length
  }
  const styledBytes = CFB.write(legacyWorkbook.cfb, { type: 'buffer' })
  const styledXls = await parseSupportSpreadsheet(new File([styledBytes], 'styled.xls', { type: 'application/vnd.ms-excel' }))
  assert.deepEqual(styledXls.rows[0].formats.Topic, { bold: true, italic: true, color: '#FF0000' })
})
