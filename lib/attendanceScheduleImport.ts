import type { RosterAttendanceAgent, ShiftGroup } from './attendance.ts'
import { getAttendanceNameScore } from './attendanceManagement.ts'
import { matchImportedAgents, normalizeAgentName, type ImportedAgent } from './agentsImport.ts'

export type ScheduleImportScope = ShiftGroup | 'all'

export type ScheduleImportRow = {
  rowNumber: number
  name: string
  startShift: string
  endShift: string
  off1?: string
  off2?: string
}

export type ScheduleImportMatch = ScheduleImportRow & {
  email: string
  rosterName: string
  matchType: 'exact' | 'fuzzy'
  score: number
}

export type ScheduleImportPreview = {
  matches: ScheduleImportMatch[]
  unmatched: ScheduleImportRow[]
  outsideScope: ScheduleImportRow[]
}

type ScheduleHeader = 'name' | 'start_shift' | 'end_shift' | 'shift_range' | 'off_1' | 'off_2' | 'days_off'

const headerAliases: Record<string, ScheduleHeader> = {
  agent: 'name',
  agentname: 'name',
  employee: 'name',
  employeename: 'name',
  fullname: 'name',
  name: 'name',
  dayoff1: 'off_1',
  daysoff1: 'off_1',
  firstdayoff: 'off_1',
  firstoff: 'off_1',
  off1: 'off_1',
  restday1: 'off_1',
  dayoff2: 'off_2',
  daysoff2: 'off_2',
  seconddayoff: 'off_2',
  secondoff: 'off_2',
  off2: 'off_2',
  restday2: 'off_2',
  dayoffs: 'days_off',
  daysoff: 'days_off',
  offdays: 'days_off',
  restdays: 'days_off',
  twodaysoff: 'days_off',
  weeklyoffs: 'days_off',
  endshift: 'end_shift',
  endtime: 'end_shift',
  shiftend: 'end_shift',
  shiftendtime: 'end_shift',
  startshift: 'start_shift',
  starttime: 'start_shift',
  shiftstart: 'start_shift',
  shiftstarttime: 'start_shift',
  schedule: 'shift_range',
  shifthours: 'shift_range',
  shiftrange: 'shift_range',
  shiftschedule: 'shift_range',
  shifttime: 'shift_range',
  startandendshift: 'shift_range',
  startendshift: 'shift_range',
  workhours: 'shift_range',
}

const cellText = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim()

const normalizeHeader = (value: unknown) => cellText(value)
  .replace(/^\uFEFF/, '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '')

const resolveHeader = (value: unknown): ScheduleHeader | null => {
  const normalized = normalizeHeader(value)
  if (!normalized) return null
  if (headerAliases[normalized]) return headerAliases[normalized]
  if (normalized.includes('agent') && normalized.includes('name')) return 'name'
  if (normalized.includes('daysoff') || normalized.includes('offdays') || normalized.includes('restdays')) return 'days_off'
  if ((normalized.includes('off') || normalized.includes('restday')) && normalized.endsWith('1')) return 'off_1'
  if ((normalized.includes('off') || normalized.includes('restday')) && normalized.endsWith('2')) return 'off_2'
  if (normalized.includes('start') && (normalized.includes('shift') || normalized.includes('time'))) return 'start_shift'
  if (normalized.includes('end') && (normalized.includes('shift') || normalized.includes('time'))) return 'end_shift'
  if (normalized.includes('shift') && (normalized.includes('schedule') || normalized.includes('time'))) return 'shift_range'
  return null
}

const splitShiftRange = (value: string): [string, string] => {
  const timeMatches = value.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?\b/gi)
  if (timeMatches && timeMatches.length >= 2) return [timeMatches[0].trim(), timeMatches[1].trim()]

  const parts = value.split(/\s*(?:\bto\b|[-–—]|\||\/)\s*/i).map(cellText).filter(Boolean)
  return [parts[0] || '', parts[1] || '']
}

const splitDaysOff = (value: string): [string, string] => {
  const dayMatches = value.match(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi)
  if (dayMatches?.length) return [dayMatches[0] || '', dayMatches[1] || '']

  const parts = value.split(/\s*(?:,|\/|\||&|\+|\band\b|\bto\b|\s[-–—]\s)\s*/i).map(cellText).filter(Boolean)
  return [parts[0] || '', parts[1] || '']
}

const findHeader = (matrix: unknown[][]) => {
  let best: { rowIndex: number; targets: Array<ScheduleHeader | null>; score: number } | null = null
  const inspectCount = Math.min(matrix.length, 30)

  const consider = (row: unknown[], rowIndex: number) => {
    const targets = row.map(resolveHeader)
    const unique = new Set(targets.filter((target): target is ScheduleHeader => Boolean(target)))
    const hasShift = unique.has('shift_range') || (unique.has('start_shift') && unique.has('end_shift'))
    if (!unique.has('name') || !hasShift) return
    if (!best || unique.size > best.score) best = { rowIndex, targets, score: unique.size }
  }

  for (let rowIndex = 0; rowIndex < inspectCount; rowIndex += 1) {
    consider(matrix[rowIndex] || [], rowIndex)
    if (rowIndex === 0) continue
    const previous = matrix[rowIndex - 1] || []
    const current = matrix[rowIndex] || []
    const width = Math.max(previous.length, current.length)
    consider(Array.from({ length: width }, (_, column) => `${cellText(previous[column])} ${cellText(current[column])}`.trim()), rowIndex)
  }

  if (!best) throw new Error('Could not find schedule columns. Include Agent Name and either Shift Schedule or separate Start Shift and End Shift columns.')
  return best as { rowIndex: number; targets: Array<ScheduleHeader | null>; score: number }
}

export const parseAttendanceScheduleMatrix = (matrix: unknown[][]): ScheduleImportRow[] => {
  if (matrix.length < 2) throw new Error('The schedule file must contain headers and at least one agent row.')
  const { rowIndex: headerRowIndex, targets } = findHeader(matrix)
  const hasOff1Column = targets.includes('off_1')
  const hasOff2Column = targets.includes('off_2')
  const hasDaysOffColumn = targets.includes('days_off')
  const rows: ScheduleImportRow[] = []
  const seen = new Set<string>()

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const source = matrix[rowIndex] || []
    let name = ''
    let startShift = ''
    let endShift = ''
    let shiftRange = ''
    let off1 = ''
    let off2 = ''
    let daysOff = ''

    targets.forEach((target, column) => {
      const value = cellText(source[column])
      if (target === 'name') name ||= value
      if (target === 'start_shift') startShift ||= value
      if (target === 'end_shift') endShift ||= value
      if (target === 'shift_range') shiftRange ||= value
      if (target === 'off_1') off1 ||= value
      if (target === 'off_2') off2 ||= value
      if (target === 'days_off') daysOff ||= value
    })

    if (!name && !startShift && !endShift && !shiftRange && !off1 && !off2 && !daysOff) continue
    if (!name) throw new Error(`Row ${rowIndex + 1} has schedule values but no agent name.`)
    if (shiftRange) [startShift, endShift] = splitShiftRange(shiftRange)
    if (hasDaysOffColumn) [off1, off2] = splitDaysOff(daysOff)
    if (!startShift || !endShift) throw new Error(`Row ${rowIndex + 1} for ${name} must have both a shift start and shift end.`)

    const normalizedName = normalizeAgentName(name)
    if (seen.has(normalizedName)) throw new Error(`Duplicate agent name in schedule file: ${name}`)
    seen.add(normalizedName)
    rows.push({
      rowNumber: rowIndex + 1,
      name,
      startShift,
      endShift,
      ...(hasDaysOffColumn || hasOff1Column ? { off1 } : {}),
      ...(hasDaysOffColumn || hasOff2Column ? { off2 } : {}),
    })
  }

  if (!rows.length) throw new Error('The schedule file does not contain any agent schedule rows.')
  return rows
}

export const previewAttendanceScheduleImport = (
  rows: ScheduleImportRow[],
  roster: RosterAttendanceAgent[],
  scope: ScheduleImportScope
): ScheduleImportPreview => {
  const eligible = roster.filter((agent) => scope === 'all' || agent.shiftGroup === scope)
  const eligibleNames = new Set(eligible.map((agent) => normalizeAgentName(agent.name)))
  const allByName = new Map<string, RosterAttendanceAgent[]>()
  roster.forEach((agent) => {
    const key = normalizeAgentName(agent.name)
    allByName.set(key, [...(allByName.get(key) || []), agent])
  })

  const outsideScope = rows.filter((row) => {
    const exact = allByName.get(normalizeAgentName(row.name)) || []
    return exact.length === 1 && !eligibleNames.has(normalizeAgentName(exact[0].name))
  })
  const outsideRows = new Set(outsideScope)
  const ambiguousExactRows = rows.filter((row) => {
    const normalized = normalizeAgentName(row.name)
    return (allByName.get(normalized) || []).filter((agent) => scope === 'all' || agent.shiftGroup === scope).length > 1
  })
  const ambiguousRows = new Set(ambiguousExactRows)
  const candidates = rows.filter((row) => !outsideRows.has(row) && !ambiguousRows.has(row))
  const importedRows: ImportedAgent[] = candidates.map((row) => ({ name: row.name }))
  const result = matchImportedAgents(importedRows, eligible, getAttendanceNameScore, 70)
  const rowByName = new Map(candidates.map((row) => [normalizeAgentName(row.name), row]))
  const agentByName = new Map(eligible.map((agent) => [agent.name, agent]))

  const matches = result.matches.flatMap((match): ScheduleImportMatch[] => {
    const row = rowByName.get(normalizeAgentName(match.incoming.name))
    const agent = agentByName.get(match.existingName)
    if (!row || !agent) return []
    return [{
      ...row,
      email: agent.email,
      rosterName: agent.name,
      matchType: match.score === 100 ? 'exact' : 'fuzzy',
      score: match.score,
    }]
  }).sort((first, second) => first.rowNumber - second.rowNumber)
  const matchedNames = new Set(matches.map((match) => normalizeAgentName(match.name)))
  const unmatched = [
    ...ambiguousExactRows,
    ...candidates.filter((row) => !matchedNames.has(normalizeAgentName(row.name))),
  ].sort((first, second) => first.rowNumber - second.rowNumber)

  return { matches, unmatched, outsideScope }
}
