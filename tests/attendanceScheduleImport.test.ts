import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as XLSX from 'xlsx'
import type { RosterAttendanceAgent } from '../lib/attendance.ts'
import { parseAttendanceScheduleMatrix, previewAttendanceScheduleImport } from '../lib/attendanceScheduleImport.ts'

const roster: RosterAttendanceAgent[] = [
  { email: 'carla@example.com', name: 'Carla Medina', teamLeader: 'Lead', startShift: '19:00', endShift: '04:00', off1: 'Tue', off2: 'Wed', shiftGroup: 'normal_graveyard' },
  { email: 'maria@example.com', name: 'Maria Luisa De Vera', teamLeader: 'Lead', startShift: '00:00', endShift: '09:00', off1: 'Sat', off2: 'Sun', shiftGroup: 'overnight' },
]

test('reads names and shift times from the same full schedule CSV accepted by Agents', () => {
  const workbook = XLSX.read(readFileSync(new URL("../AUGUST SCHEDULE - August' 26 Schedule.csv", import.meta.url)), { type: 'buffer' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: '' })
  const rows = parseAttendanceScheduleMatrix(matrix)

  assert.equal(rows.length, 102)
  assert.deepEqual(rows[0], { rowNumber: 2, name: 'Carla  Medina', startShift: '7:00 PM', endShift: '4:00 AM', off1: 'Tue', off2: 'Wed' })
})

test('parses focused schedule files with combined or separate shift columns', () => {
  assert.deepEqual(parseAttendanceScheduleMatrix([
    ['September schedule'],
    ['Agent Name', 'Shift Schedule', 'Days Off', 'Ignored Team Leader'],
    ['Carla Medina', '7:00 PM - 4:00 AM', 'Saturday / Sunday', 'Lead'],
  ]), [{ rowNumber: 3, name: 'Carla Medina', startShift: '7:00 PM', endShift: '4:00 AM', off1: 'Saturday', off2: 'Sunday' }])

  assert.deepEqual(parseAttendanceScheduleMatrix([
    ['Name', 'Start Shift', 'End Shift', 'Off 1', 'Off 2'],
    ['Maria Luisa De Vera', '00:00', '09:00', 'Sat', 'Sun'],
  ]), [{ rowNumber: 2, name: 'Maria Luisa De Vera', startShift: '00:00', endShift: '09:00', off1: 'Sat', off2: 'Sun' }])
})

test('matches only the selected shift group and reports excluded rows', () => {
  const rows = parseAttendanceScheduleMatrix([
    ['Name', 'Schedule'],
    ['Carla Medina', '8:00 PM - 5:00 AM'],
    ['Maria Luisa De Vera', '1:00 AM - 10:00 AM'],
  ])
  const preview = previewAttendanceScheduleImport(rows, roster, 'overnight')

  assert.deepEqual(preview.matches.map((match) => match.email), ['maria@example.com'])
  assert.deepEqual(preview.outsideScope.map((row) => row.name), ['Carla Medina'])
  assert.equal(preview.unmatched.length, 0)
})

test('marks a unique tokenized roster-name match as fuzzy for uploader review', () => {
  const rows = parseAttendanceScheduleMatrix([
    ['Employee Name', 'Start Time', 'End Time'],
    ['Maria De Vera', '00:30', '09:30'],
  ])
  const preview = previewAttendanceScheduleImport(rows, roster, 'all')

  assert.equal(preview.matches.length, 1)
  assert.equal(preview.matches[0].email, 'maria@example.com')
  assert.equal(preview.matches[0].matchType, 'fuzzy')
})

test('does not automatically match an ambiguous duplicate roster name', () => {
  const duplicateRoster = [roster[0], { ...roster[1], name: 'Carla Medina' }]
  const rows = parseAttendanceScheduleMatrix([
    ['Name', 'Schedule'],
    ['Carla Medina', '19:00 - 04:00'],
  ])
  const preview = previewAttendanceScheduleImport(rows, duplicateRoster, 'all')

  assert.equal(preview.matches.length, 0)
  assert.deepEqual(preview.unmatched.map((row) => row.name), ['Carla Medina'])
})

test('rejects incomplete shifts and duplicate normalized names', () => {
  assert.throws(() => parseAttendanceScheduleMatrix([
    ['Name', 'Start Shift', 'End Shift'],
    ['Carla Medina', '19:00', ''],
  ]), /both a shift start and shift end/)

  assert.throws(() => parseAttendanceScheduleMatrix([
    ['Name', 'Schedule'],
    ['Carla Medina', '19:00 - 04:00'],
    ['Carla-Medina', '20:00 - 05:00'],
  ]), /Duplicate agent name/)
})
