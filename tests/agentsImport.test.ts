import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  matchImportedAgents,
  parseAgentScheduleMatrix,
} from '../lib/agentsImport.ts'

test('parses the checked-in raw August CSV without preprocessing', () => {
  const file = readFileSync(new URL("../AUGUST SCHEDULE - August' 26 Schedule.csv", import.meta.url))
  const workbook = XLSX.read(file, { type: 'buffer' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  const rows = parseAgentScheduleMatrix(matrix)

  assert.equal(rows.length, 102)
  assert.deepEqual(rows[0], {
    name: 'Carla  Medina',
    email: 'cmedina@m-piece.com',
    role: 'Phone',
    off_1: 'Tue',
    off_2: 'Wed',
    start_shift: '7:00 PM',
    end_shift: '4:00 AM',
    comments: 'PSD trained',
    team_leader: 'Charlene Esparza / Kevin Gallego',
  })
})

test('parses the August schedule layout with combined days off and shift columns', () => {
  const rows = parseAgentScheduleMatrix([
    ["AUGUST SCHEDULE - August' 26 Schedule"],
    [
      'Agent Name',
      'Work Email',
      'Team Leader',
      'Work Arrangement',
      'Position',
      'Two (2) Days Off',
      'Shift Schedule',
      'Remarks',
    ],
    [
      'Jamie Dela Cruz',
      'jamie@example.com',
      'Taylor Lead',
      'WFH',
      'Agent',
      'Saturday / Sunday',
      '8:00 PM - 5:00 AM',
      'Training on Monday',
    ],
  ])

  assert.deepEqual(rows, [
    {
      name: 'Jamie Dela Cruz',
      email: 'jamie@example.com',
      team_leader: 'Taylor Lead',
      role: 'Agent',
      off_1: 'Saturday',
      off_2: 'Sunday',
      start_shift: '8:00 PM',
      end_shift: '5:00 AM',
      comments: 'Training on Monday',
    },
  ])
})

test('parses separate schedule fields and rejects normalized duplicate names', () => {
  const matrix = [
    [
      'Name',
      'Email',
      'Supervisor',
      'Setting',
      'Role',
      'Day Off 1',
      'Day Off 2',
      'Start Shift',
      'End Shift',
      'Comments',
    ],
    ['José Reyes', 'jose@example.com', 'Lead', 'Onsite', 'Agent', 'Mon', 'Tue', '09:00', '18:00', ''],
    ['Jose-Reyes', 'jose2@example.com', 'Lead', 'Onsite', 'Agent', 'Mon', 'Tue', '09:00', '18:00', ''],
  ]

  assert.throws(() => parseAgentScheduleMatrix(matrix), /Duplicate agent name/)
})

test('matches normalized exact names and leaves ambiguous fuzzy names for the modal', () => {
  const imported = [
    { name: 'José Reyes', email: 'jose@example.com' },
    { name: 'Alex Smith', email: 'alex@example.com' },
  ]
  const existing = [{ name: 'Jose-Reyes' }, { name: 'Alex Smith A' }, { name: 'Alex Smith B' }]
  const score = (existingName: string, incomingName: string) =>
    existingName.startsWith(incomingName) ? 90 : 0

  const result = matchImportedAgents(imported, existing, score)

  assert.deepEqual(result.matches.map(match => match.existingName), ['Jose-Reyes'])
  assert.deepEqual(result.unmatchedNew.map(agent => agent.name), ['Alex Smith'])
  assert.deepEqual(result.missingOld.map(agent => agent.name), ['Alex Smith A', 'Alex Smith B'])
})
