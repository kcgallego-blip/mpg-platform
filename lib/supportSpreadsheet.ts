'use client'

import * as XLSX from 'xlsx'
import type { SupportCellFormat } from './support'

export type SupportSpreadsheetRow = {
  values: Record<string, string>
  formats: Record<string, SupportCellFormat>
}

export type SupportSpreadsheet = {
  headers: string[]
  rows: SupportSpreadsheetRow[]
}

type SpreadsheetFont = {
  bold?: boolean | number
  italic?: boolean | number
  color?: { rgb?: string }
}

type InternalWorkbook = XLSX.WorkBook & {
  Directory?: { sheets?: string[] }
  files?: Record<string, { content?: Uint8Array }>
  Styles?: { CellXf?: Array<{ fontId?: number; fontid?: string }>; Fonts?: SpreadsheetFont[] }
  cfb?: { FileIndex?: Array<{ name?: string; content?: Uint8Array }> }
}

export async function parseSupportSpreadsheet(file: File): Promise<SupportSpreadsheet> {
  const extension = file.name.toLowerCase().split('.').pop()
  if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) throw new Error('Choose a CSV, XLS, or XLSX file')

  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array', raw: false, cellStyles: true, cellHTML: true, bookFiles: true,
  }) as InternalWorkbook
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet?.['!ref']) throw new Error('The spreadsheet is empty')

  const range = XLSX.utils.decode_range(sheet['!ref'])
  const headerRow = findHeaderRow(sheet, range)
  if (headerRow < 0) throw new Error('The spreadsheet does not contain a header row')

  const headerColumns: Array<{ header: string; column: number }> = []
  const seenHeaders = new Map<string, number>()
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const label = cellText(sheet[XLSX.utils.encode_cell({ r: headerRow, c: column })]).trim()
    if (!label) continue
    const count = (seenHeaders.get(label) || 0) + 1
    seenHeaders.set(label, count)
    headerColumns.push({ header: count === 1 ? label : `${label} (${count})`, column })
  }

  const xlsxStyles = extractXlsxStyleIds(workbook)
  const legacyStyles = extension === 'xls' ? extractLegacyXlsStyles(workbook) : new Map<string, SupportCellFormat>()
  const rows: SupportSpreadsheetRow[] = []
  for (let rowIndex = headerRow + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const values: Record<string, string> = {}
    const formats: Record<string, SupportCellFormat> = {}
    let hasValue = false
    for (const { header, column } of headerColumns) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: column })
      const value = cellText(sheet[address]).replace(/\r\n?/g, '\n')
      values[header] = value
      if (value !== '') hasValue = true
      const format = legacyStyles.get(address) || formatFromXlsxStyle(workbook, xlsxStyles.get(address))
      if (format && Object.keys(format).length > 0) formats[header] = format
    }
    if (hasValue) rows.push({ values, formats })
  }

  if (rows.length === 0) throw new Error('The spreadsheet must contain headers and at least one data row')
  return { headers: headerColumns.map(item => item.header), rows }
}

function findHeaderRow(sheet: XLSX.WorkSheet, range: XLSX.Range) {
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      if (cellText(sheet[XLSX.utils.encode_cell({ r: row, c: column })]).trim()) return row
    }
  }
  return -1
}

function cellText(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  return String(cell.w ?? cell.v)
}

function extractXlsxStyleIds(workbook: InternalWorkbook) {
  const result = new Map<string, number>()
  const rawPath = workbook.Directory?.sheets?.[0]?.replace(/^\//, '')
  const content = rawPath ? workbook.files?.[rawPath]?.content : undefined
  if (!content) return result
  const xml = new TextDecoder('utf-8').decode(content)
  for (const match of xml.matchAll(/<c\b[^>]*>/g)) {
    const address = /\br="([A-Z]+[0-9]+)"/i.exec(match[0])?.[1]
    const styleId = /\bs="([0-9]+)"/i.exec(match[0])?.[1]
    if (address && styleId) result.set(address.toUpperCase(), Number(styleId))
  }
  return result
}

function formatFromXlsxStyle(workbook: InternalWorkbook, styleId: number | undefined): SupportCellFormat | undefined {
  if (styleId === undefined || styleId === 0) return undefined
  const cellStyle = workbook.Styles?.CellXf?.[styleId]
  const fontId = Number(cellStyle?.fontId ?? cellStyle?.fontid ?? 0)
  return formatFromFont(workbook.Styles?.Fonts?.[fontId])
}

function formatFromFont(font: SpreadsheetFont | undefined): SupportCellFormat | undefined {
  if (!font) return undefined
  const format: SupportCellFormat = {}
  if (font.bold) format.bold = true
  if (font.italic) format.italic = true
  const rgb = font.color?.rgb?.replace(/^#|^[0-9a-f]{2}(?=[0-9a-f]{6}$)/i, '').toUpperCase()
  if (rgb && /^[0-9A-F]{6}$/.test(rgb) && rgb !== '000000') format.color = `#${rgb}`
  return Object.keys(format).length > 0 ? format : undefined
}

function extractLegacyXlsStyles(workbook: InternalWorkbook) {
  const result = new Map<string, SupportCellFormat>()
  const content = workbook.cfb?.FileIndex?.find(file => file.name === 'Workbook' || file.name === 'Book')?.content
  if (!content) return result
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength)
  const fonts: Array<{ flags: number; colorIndex: number; weight: number }> = []
  const fontIds: number[] = []
  const palette = new Map<number, string>()
  let offset = 0
  let worksheetNumber = 0
  let inFirstWorksheet = false

  while (offset + 4 <= view.byteLength) {
    const recordType = view.getUint16(offset, true)
    const length = view.getUint16(offset + 2, true)
    const dataOffset = offset + 4
    if (dataOffset + length > view.byteLength) break
    if ([0x0009, 0x0209, 0x0409, 0x0809].includes(recordType) && length >= 4) {
      if (view.getUint16(dataOffset + 2, true) === 0x0010) {
        worksheetNumber += 1
        inFirstWorksheet = worksheetNumber === 1
      }
    } else if (recordType === 0x000A) inFirstWorksheet = false
    else if (!inFirstWorksheet && recordType === 0x0031 && length >= 8) {
      fonts.push({ flags: view.getUint16(dataOffset + 2, true), colorIndex: view.getUint16(dataOffset + 4, true), weight: view.getUint16(dataOffset + 6, true) })
    } else if (!inFirstWorksheet && recordType === 0x00E0 && length >= 2) fontIds.push(view.getUint16(dataOffset, true))
    else if (!inFirstWorksheet && recordType === 0x0092 && length >= 2) {
      const count = Math.min(view.getUint16(dataOffset, true), Math.floor((length - 2) / 4))
      for (let index = 0; index < count; index += 1) {
        const colorOffset = dataOffset + 2 + index * 4
        palette.set(index + 8, toHex(view.getUint8(colorOffset), view.getUint8(colorOffset + 1), view.getUint8(colorOffset + 2)))
      }
    } else if (inFirstWorksheet) {
      if ([0x0006, 0x0201, 0x0203, 0x0204, 0x0205, 0x027E, 0x00D6, 0x00FD].includes(recordType) && length >= 6) {
        addLegacyFormat(result, view.getUint16(dataOffset, true), view.getUint16(dataOffset + 2, true), view.getUint16(dataOffset + 4, true), fonts, fontIds, palette)
      } else if (recordType === 0x00BD && length >= 12) {
        const row = view.getUint16(dataOffset, true), firstColumn = view.getUint16(dataOffset + 2, true)
        for (let index = 0; index < Math.floor((length - 6) / 6); index += 1) addLegacyFormat(result, row, firstColumn + index, view.getUint16(dataOffset + 4 + index * 6, true), fonts, fontIds, palette)
      } else if (recordType === 0x00BE && length >= 8) {
        const row = view.getUint16(dataOffset, true), firstColumn = view.getUint16(dataOffset + 2, true)
        for (let index = 0; index < Math.floor((length - 6) / 2); index += 1) addLegacyFormat(result, row, firstColumn + index, view.getUint16(dataOffset + 4 + index * 2, true), fonts, fontIds, palette)
      }
    }
    offset = dataOffset + length
  }
  return result
}

function addLegacyFormat(output: Map<string, SupportCellFormat>, row: number, column: number, styleId: number, fonts: Array<{ flags: number; colorIndex: number; weight: number }>, fontIds: number[], palette: Map<number, string>) {
  if (styleId === 0) return
  const rawFontId = fontIds[styleId]
  if (rawFontId === undefined) return
  const font = fonts[rawFontId >= 4 ? rawFontId - 1 : rawFontId]
  if (!font) return
  const format: SupportCellFormat = {}
  if (font.weight >= 700) format.bold = true
  if ((font.flags & 0x0002) !== 0) format.italic = true
  const color = palette.get(font.colorIndex) || LEGACY_COLORS[font.colorIndex]
  if (color && color !== '#000000') format.color = color
  if (Object.keys(format).length > 0) output.set(XLSX.utils.encode_cell({ r: row, c: column }), format)
}

function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

const LEGACY_COLORS: Record<number, string> = {
  0: '#000000', 1: '#FFFFFF', 2: '#FF0000', 3: '#00FF00', 4: '#0000FF', 5: '#FFFF00', 6: '#FF00FF', 7: '#00FFFF',
  8: '#000000', 9: '#FFFFFF', 10: '#FF0000', 11: '#00FF00', 12: '#0000FF', 13: '#FFFF00', 14: '#FF00FF', 15: '#00FFFF',
  16: '#800000', 17: '#008000', 18: '#000080', 19: '#808000', 20: '#800080', 21: '#008080', 22: '#C0C0C0', 23: '#808080',
}
