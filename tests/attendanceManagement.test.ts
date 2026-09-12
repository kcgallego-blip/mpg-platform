import assert from 'node:assert/strict'
import test from 'node:test'
import { canManageAttendance, isAttendanceRosterRole } from '../lib/attendanceAccess.ts'
import { buildAgentAttendanceClipboard } from '../lib/attendanceClipboard.ts'
import {
  buildImportPreview,
  buildAbsenceReviews,
  buildScheduleRevertChanges,
  buildTrackerColumn,
  findEffectiveSchedule,
  getAttendanceTiming,
  getAttendanceNameScore,
  parseGoogleFormPaste,
  previewTrackerOrder,
  REJECT_IMPORT_IDENTITY,
  resolveAttendanceDay,
  validateTrackerOrder,
} from '../lib/attendanceManagement.ts'
import type { RosterAttendanceAgent } from '../lib/attendance.ts'

const roster: RosterAttendanceAgent[] = [
  { email: 'carla@example.com', name: 'Carla Medina', teamLeader: 'Charlene', startShift: '21:00', endShift: '06:00', off1: 'Saturday', off2: 'Sunday', shiftGroup: 'normal_graveyard' },
  { email: 'maria@example.com', name: 'Maria Luisa De Vera', teamLeader: 'Charlene', startShift: '01:00', endShift: '10:00', off1: 'Saturday', off2: 'Sunday', shiftGroup: 'overnight' },
]

test('parses Google Form rows with optional headers and preserves the displayed wall clock', () => {
  const parsed = parseGoogleFormPaste('Timestamp\tEmail\tAgent Name\tAction\tTeam Leader\n9/6/2026 8:07:28\tMARIA@example.com\tMaria Luisa De Vera\ttImE OuT\tCharlene')
  assert.deepEqual(parsed.issues, [])
  assert.equal(parsed.rows[0].email, 'maria@example.com')
  assert.equal(parsed.rows[0].databaseTimestamp, '2026-09-06 08:07:28')
  assert.equal(parsed.rows[0].displayedTimestamp, '9/6/2026 8:07:28')
  assert.equal(parsed.rows[0].action, 'time_out')
})

test('maps OVERTIME IN and OVERTIME OUT into the attendance Time In/Out fields', () => {
  const parsed = parseGoogleFormPaste([
    '9/6/2026 18:00:00\tcarla@example.com\tCarla Medina\tOVERTIME IN\tCharlene',
    '9/6/2026 20:00:00\tcarla@example.com\tCarla Medina\tovertime out\tCharlene',
  ].join('\n'))
  assert.deepEqual(parsed.issues, [])
  assert.deepEqual(parsed.rows.map((row) => row.submittedAction), ['overtime_in', 'overtime_out'])
  assert.deepEqual(parsed.rows.map((row) => row.action), ['time_in', 'time_out'])
})

test('preserves the displayed overnight response timestamp before cohort date assignment', () => {
  const parsed = parseGoogleFormPaste('9/8/2026 8:07:28\tmaria@example.com\tMaria Luisa De Vera\tTime OUT\tCharlene')
  const preview = buildImportPreview({ rows: parsed.rows, roster, existing: [] })
  assert.equal(preview.agents[0].timeOut, '2026-09-08 08:07:28')
  assert.equal(preview.agents[0].missing[0], 'time_in')
})

test('assigns Normal/Graveyard to the business date and Overnight to the following date', () => {
  const parsed = parseGoogleFormPaste([
    '9/7/2026 19:00:00\tcarla@example.com\tCarla Medina\tTime IN\tCharlene',
    '9/8/2026 00:05:00\tmaria@example.com\tMaria Luisa De Vera\tTime IN\tCharlene',
  ].join('\n'))
  const resolvedDays = roster.flatMap((agent) => ['2026-09-07', '2026-09-08'].map((date) =>
    resolveAttendanceDay({ rosterAgent: agent, date, currentShiftDate: '2026-09-08' })
  ))
  const preview = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [{ agent: 'maria@example.com', shift_date: '2026-09-08', time_in: '2026-09-08 00:01:00', time_out: null }],
    resolvedDays,
    baseShiftDate: '2026-09-07',
  })
  assert.equal(preview.agents.find((agent) => agent.email === 'carla@example.com')?.shiftDate, '2026-09-07')
  assert.equal(preview.agents.find((agent) => agent.email === 'maria@example.com')?.shiftDate, '2026-09-08')
  assert.deepEqual(preview.agents.find((agent) => agent.email === 'maria@example.com')?.conflicts, ['time_in'])
})

test('selects the latest duplicate Time In and earliest duplicate Time Out', () => {
  const parsed = parseGoogleFormPaste([
    '9/6/2026 8:00:00\tcarla@example.com\tCarla Medina\tTime IN\tCharlene',
    '9/6/2026 8:01:00\tcarla@example.com\tCarla Medina\tTime IN\tCharlene',
    '9/6/2026 17:00:00\tcarla@example.com\tCarla Medina\tTime OUT\tCharlene',
    '9/6/2026 17:02:00\tcarla@example.com\tCarla Medina\tTime OUT\tCharlene',
  ].join('\n'))
  const preview = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [{ agent: 'carla@example.com', shift_date: '2026-09-06', time_in: '2026-09-06 07:59:00', time_out: null }],
    overtimeResolutions: { 'carla@example.com': { pre_shift: 'not_overtime' } },
  })
  assert.equal(preview.issues.every((issue) => !issue.blocking), true)
  assert.equal(preview.agents[0].timeIn, '2026-09-06 08:01:00')
  assert.equal(preview.agents[0].timeOut, '2026-09-06 17:00:00')
  assert.deepEqual(preview.agents[0].conflicts, ['time_in'])
})

test('unknown emails require approval before using a fuzzy roster-name fallback', () => {
  const parsed = parseGoogleFormPaste('9/6/2026 8:00:00\twrong@example.com\tMaria Luisa De Vra\tTime IN\tCharlene')
  const initial = buildImportPreview({ rows: parsed.rows, roster, existing: [] })
  assert.equal(initial.agents.length, 0)
  assert.equal(initial.identityReviews[0].candidates[0].email, 'maria@example.com')
  assert.equal(initial.issues[0].blocking, true)

  const approved = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    identityResolutions: { [initial.identityReviews[0].key]: 'maria@example.com' },
  })
  assert.equal(approved.identityReviews.length, 0)
  assert.equal(approved.agents[0].email, 'maria@example.com')
  assert.match(approved.agents[0].nameWarning || '', /approved name fallback/)
})

test('uncertain identity schedule evidence uses AM/PM and Overnight calendar dates accurately', () => {
  const overnightAgent: RosterAttendanceAgent = {
    ...roster[1],
    startShift: '12:00 AM',
    endShift: '9:00 AM',
    off1: '',
    off2: '',
  }
  const overnightDays = ['2026-09-07', '2026-09-08'].map((date) => resolveAttendanceDay({
    rosterAgent: overnightAgent,
    date,
    currentShiftDate: '2026-09-07',
  }))
  const overnightPaste = parseGoogleFormPaste('9/7/2026 11:58 PM\twrong@example.com\tMaria Luisa De Vra\tTime IN\tCharlene')
  const overnightPreview = buildImportPreview({
    rows: overnightPaste.rows,
    roster: [overnightAgent],
    existing: [],
    resolvedDays: overnightDays,
    baseShiftDate: '2026-09-07',
  })
  assert.equal(overnightPreview.identityReviews[0].candidates[0].scheduleEvidence, '2 min early from scheduled Time In (12:00 AM)')

  const eveningAgent: RosterAttendanceAgent = {
    ...roster[0],
    startShift: '9:00 PM',
    endShift: '6:00 AM',
    off1: '',
    off2: '',
  }
  const eveningDay = resolveAttendanceDay({ rosterAgent: eveningAgent, date: '2026-09-07', currentShiftDate: '2026-09-07' })
  const eveningPaste = parseGoogleFormPaste('9/7/2026 8:55 PM\twrong@example.com\tCarla Medna\tTime IN\tCharlene')
  const eveningPreview = buildImportPreview({
    rows: eveningPaste.rows,
    roster: [eveningAgent],
    existing: [],
    resolvedDays: [eveningDay],
    baseShiftDate: '2026-09-07',
  })
  assert.equal(eveningPreview.identityReviews[0].candidates[0].scheduleEvidence, '5 min early from scheduled Time In (9:00 PM)')
})

test('conflicting known email and name require uploader approval with schedule evidence', () => {
  const parsed = parseGoogleFormPaste('9/6/2026 21:05:00\tcarla@example.com\tMaria Luisa De Vera\tTime IN\tCharlene')
  const resolvedDays = roster.map((agent) => resolveAttendanceDay({
    rosterAgent: agent,
    date: '2026-09-06',
    currentShiftDate: '2026-09-06',
  }))
  const initial = buildImportPreview({ rows: parsed.rows, roster, existing: [], resolvedDays })
  const review = initial.identityReviews[0]
  assert.equal(review.reason, 'email_name_conflict')
  assert.equal(review.candidates.find((candidate) => candidate.email === 'carla@example.com')?.emailMatch, true)
  assert.match(review.candidates.find((candidate) => candidate.email === 'carla@example.com')?.scheduleEvidence || '', /RDOT/)
  assert.equal(initial.issues.some((issue) => issue.blocking), true)

  const approved = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    resolvedDays,
    identityResolutions: { [review.key]: 'maria@example.com' },
  })
  assert.equal(approved.agents[0].email, 'maria@example.com')
  assert.match(approved.agents[0].nameWarning || '', /uploader approval/)
  assert.match(approved.agents[0].scheduleWarning || '', /RDOT/)

  const rejected = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    resolvedDays,
    identityResolutions: { [review.key]: REJECT_IMPORT_IDENTITY },
  })
  assert.equal(rejected.agents.length, 0)
  assert.equal(rejected.issues.some((issue) => issue.blocking), false)
})

test('widely separated same-action rows require approval as a possible incorrect tag', () => {
  const parsed = parseGoogleFormPaste([
    '9/6/2026 8:00:00\tcarla@example.com\tCarla Medina\tTime OUT\tCharlene',
    '9/6/2026 17:00:00\tcarla@example.com\tCarla Medina\tTime OUT\tCharlene',
  ].join('\n'))
  const initial = buildImportPreview({ rows: parsed.rows, roster, existing: [] })
  assert.equal(initial.agents[0].suspectedMistag?.gapMinutes, 540)
  assert.equal(initial.issues.some((issue) => issue.blocking), true)
  assert.equal(initial.agents[0].timeOut, '2026-09-06 08:00:00')

  const invalidDecision = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    mistagResolutions: { 'carla@example.com': 'not-a-decision' as never },
  })
  assert.equal(invalidDecision.issues.some((issue) => issue.blocking), true)

  const corrected = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    mistagResolutions: { 'carla@example.com': 'reinterpret' },
    overtimeResolutions: { 'carla@example.com': { pre_shift: 'not_overtime' } },
  })
  assert.equal(corrected.issues.some((issue) => issue.blocking), false)
  assert.equal(corrected.agents[0].timeIn, '2026-09-06 08:00:00')
  assert.equal(corrected.agents[0].timeOut, '2026-09-06 17:00:00')
})

test('calculates early, late, post-shift, and undertime minutes across midnight', () => {
  const overtime = getAttendanceTiming({
    shiftDate: '2026-09-07',
    startShift: '21:00',
    endShift: '06:00',
    timeIn: '2026-09-07 18:30:00',
    timeOut: '2026-09-08 08:15:00',
  })
  assert.deepEqual(overtime, {
    preShiftOtMinutes: 150,
    postShiftOtMinutes: 135,
    lateMinutes: 0,
    undertimeMinutes: 0,
  })

  const shortDay = getAttendanceTiming({
    shiftDate: '2026-09-07',
    startShift: '21:00',
    endShift: '06:00',
    timeIn: '2026-09-07 21:17:00',
    timeOut: '2026-09-08 05:42:00',
  })
  assert.equal(shortDay.lateMinutes, 17)
  assert.equal(shortDay.undertimeMinutes, 18)
})

test('builds two-cell agent clipboard output with late, undertime, and RDOT colors', () => {
  const lateAndUndertime = resolveAttendanceDay({
    rosterAgent: { ...roster[0], off1: '', off2: '' },
    date: '2026-09-07',
    currentShiftDate: '2026-09-07',
    attendance: {
      agent: roster[0].email,
      shift_date: '2026-09-07',
      time_in: '2026-09-07 21:10:00',
      time_out: '2026-09-08 05:45:00',
    },
  })
  const delayed = buildAgentAttendanceClipboard(lateAndUndertime)
  assert.equal(delayed.plainText, '21:10:00\n05:45:00')
  assert.deepEqual(delayed.colors, ['#FFFF00', '#FFFF00'])
  assert.equal((delayed.html.match(/bgcolor="#FFFF00"/g) || []).length, 2)

  const rdot = resolveAttendanceDay({
    rosterAgent: roster[0],
    date: '2026-09-06',
    currentShiftDate: '2026-09-06',
    attendance: {
      agent: roster[0].email,
      shift_date: '2026-09-06',
      time_in: '2026-09-06 21:00:00',
      time_out: '2026-09-07 06:00:00',
    },
  })
  const restDay = buildAgentAttendanceClipboard(rdot)
  assert.deepEqual(restDay.colors, ['#34A853', '#34A853'])
  assert.equal((restDay.html.match(/bgcolor="#34A853"/g) || []).length, 2)
})

test('treats an Overnight 11:58 PM Time In as two minutes early for a midnight start', () => {
  const operationalDate = getAttendanceTiming({
    shiftDate: '2026-09-08',
    startShift: '12:00 AM',
    endShift: '9:00 AM',
    timeIn: '2026-09-07 23:58:00',
    timeOut: '2026-09-08 09:00:00',
  })
  assert.equal(operationalDate.preShiftOtMinutes, 2)
  assert.equal(operationalDate.lateMinutes, 0)

  const baseDatePayload = getAttendanceTiming({
    shiftDate: '2026-09-07',
    startShift: '12:00 AM',
    endShift: '9:00 AM',
    timeIn: '2026-09-07 23:58:00',
    timeOut: '2026-09-08 09:00:00',
  })
  assert.equal(baseDatePayload.preShiftOtMinutes, 2)
  assert.equal(baseDatePayload.lateMinutes, 0)
  assert.equal(baseDatePayload.postShiftOtMinutes, 0)
  assert.equal(baseDatePayload.undertimeMinutes, 0)
})

test('requires uploader approval at the two-hour pre/post-shift OT threshold', () => {
  const parsed = parseGoogleFormPaste([
    '9/7/2026 19:00:00\tcarla@example.com\tCarla Medina\tTime IN\tCharlene',
    '9/8/2026 08:00:00\tcarla@example.com\tCarla Medina\tTime OUT\tCharlene',
  ].join('\n'))
  const resolvedDays = [resolveAttendanceDay({
    rosterAgent: roster[0],
    date: '2026-09-07',
    currentShiftDate: '2026-09-07',
  })]
  const initial = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    resolvedDays,
    baseShiftDate: '2026-09-07',
  })
  assert.equal(initial.agents[0].overtimeReview.preShift?.minutes, 120)
  assert.equal(initial.agents[0].overtimeReview.postShift?.minutes, 120)
  assert.equal(initial.issues.filter((issue) => issue.blocking).length, 2)

  const approved = buildImportPreview({
    rows: parsed.rows,
    roster,
    existing: [],
    resolvedDays,
    baseShiftDate: '2026-09-07',
    overtimeResolutions: {
      'carla@example.com': { pre_shift: 'confirm', post_shift: 'not_overtime' },
    },
  })
  assert.equal(approved.issues.some((issue) => issue.blocking), false)
  assert.equal(approved.agents[0].overtimeReview.preShift?.resolution, 'confirm')
  assert.equal(approved.agents[0].overtimeReview.postShift?.resolution, 'not_overtime')
})

test('resolved calendar days expose approved overtime and punctuality values', () => {
  const day = resolveAttendanceDay({
    rosterAgent: roster[0],
    date: '2026-09-07',
    currentShiftDate: '2026-09-08',
    attendance: {
      agent: roster[0].email,
      shift_date: '2026-09-07',
      time_in: '2026-09-07 18:30:00',
      time_out: '2026-09-08 05:42:00',
      pre_shift_ot_approved: true,
      post_shift_ot_approved: false,
    },
  })
  assert.equal(day.preShiftOtApproved, true)
  assert.equal(day.preShiftOtMinutes, 150)
  assert.equal(day.undertimeMinutes, 18)
})

test('one-hour grace uses the scheduled shift-date timeline across midnight', () => {
  const baseAgent = { ...roster[0], off1: '', off2: '', endShift: '04:00' }
  const fourHoursLate = resolveAttendanceDay({
    rosterAgent: { ...baseAgent, startShift: '19:00' },
    date: '2026-09-06',
    currentShiftDate: '2026-09-06',
    currentTimestamp: '2026-09-06 23:00:00',
  })
  const withinGrace = resolveAttendanceDay({
    rosterAgent: { ...baseAgent, startShift: '22:30' },
    date: '2026-09-06',
    currentShiftDate: '2026-09-06',
    currentTimestamp: '2026-09-06 23:00:00',
  })
  const graceExpired = resolveAttendanceDay({
    rosterAgent: { ...baseAgent, startShift: '22:00' },
    date: '2026-09-06',
    currentShiftDate: '2026-09-06',
    currentTimestamp: '2026-09-06 23:00:00',
  })
  const afterMidnight = resolveAttendanceDay({
    rosterAgent: { ...baseAgent, startShift: '22:00' },
    date: '2026-09-06',
    currentShiftDate: '2026-09-07',
    currentTimestamp: '2026-09-07 02:00:00',
  })
  assert.equal(fourHoursLate.status, 'Absence Confirmation Required')
  assert.equal(withinGrace.status, 'Awaiting Time In')
  assert.equal(graceExpired.status, 'Absence Confirmation Required')
  assert.equal(afterMidnight.status, 'Absence Confirmation Required')
})

test('absence outcomes are separate from exceptions and require an uploader decision', () => {
  const agent = { ...roster[0], off1: '', off2: '', startShift: '19:00' }
  const pending = resolveAttendanceDay({
    rosterAgent: agent,
    date: '2026-09-07',
    currentShiftDate: '2026-09-07',
    currentTimestamp: '2026-09-07 23:00:00',
  })
  const initial = buildAbsenceReviews({ days: [pending] })
  assert.equal(initial[0].resolution, null)
  assert.equal(buildAbsenceReviews({ days: [pending], importedAttendanceEmails: [agent.email] }).length, 0)
  const approved = buildAbsenceReviews({ days: [pending], resolutions: { [agent.email]: 'confirmed_absent' } })
  assert.equal(approved[0].resolution, 'confirmed_absent')

  const absent = resolveAttendanceDay({
    rosterAgent: agent,
    date: '2026-09-07',
    currentShiftDate: '2026-09-07',
    currentTimestamp: '2026-09-07 23:00:00',
    outcome: { agentEmail: agent.email, shiftDate: '2026-09-07', outcome: 'confirmed_absent' },
  })
  const notAbsent = resolveAttendanceDay({
    rosterAgent: agent,
    date: '2026-09-07',
    currentShiftDate: '2026-09-07',
    currentTimestamp: '2026-09-07 23:00:00',
    outcome: { agentEmail: agent.email, shiftDate: '2026-09-07', outcome: 'not_absent' },
  })
  assert.equal(absent.status, 'Absent')
  assert.equal(notAbsent.status, 'Not Absent - Missing Attendance')
})

test('tracker order ignores spacer rows and rejects missing, duplicate, and unknown agents', () => {
  const valid = validateTrackerOrder('Carla Medina\n\nMaria Luisa De Vera', roster)
  assert.equal(valid.valid, true)
  assert.deepEqual(valid.agents.map((agent) => agent.email), ['carla@example.com', 'maria@example.com'])
  const invalid = validateTrackerOrder('Carla Medina\nUnknown Person\nCarla Medina', roster)
  assert.equal(invalid.valid, false)
  assert.ok(invalid.issues.some((issue) => issue.includes('Choose a roster match')))
  assert.ok(invalid.issues.some((issue) => issue.includes('Duplicate')))
  assert.ok(invalid.issues.some((issue) => issue.includes('Missing active')))
})

test('tracker order suggests fuzzy roster names but requires the confirmed mapping to save', () => {
  const text = 'Carla Medina\nMaria Luisa De Vra'
  const preview = previewTrackerOrder(text, roster)
  assert.equal(preview.rows[0].matchType, 'exact')
  assert.equal(preview.rows[1].matchType, 'fuzzy')
  assert.equal(preview.rows[1].candidates[0].email, 'maria@example.com')
  assert.ok(getAttendanceNameScore('Maria Luisa De Vera', 'Maria Luisa De Vra') >= 70)

  assert.equal(validateTrackerOrder(text, roster).valid, false)
  const confirmed = validateTrackerOrder(text, roster, { '2': 'maria@example.com' })
  assert.equal(confirmed.valid, true)
  assert.deepEqual(confirmed.agents.map((agent) => agent.email), ['carla@example.com', 'maria@example.com'])
})

test('ambiguous fuzzy tracker matches remain unselected for manual review', () => {
  const ambiguousRoster = [
    { ...roster[0], email: 'alex-a@example.com', name: 'Alex Smith A' },
    { ...roster[1], email: 'alex-b@example.com', name: 'Alex Smith B' },
  ]
  const preview = previewTrackerOrder('Alex Smith', ambiguousRoster)
  assert.equal(preview.rows[0].matchType, 'fuzzy')
  assert.equal(preview.rows[0].selectedEmail, null)
  assert.equal(preview.rows[0].candidates.length, 2)
})

test('exact-date exceptions override days off and never produce an automatic Absent status', () => {
  const holiday = resolveAttendanceDay({
    rosterAgent: roster[0], date: '2026-09-07', currentShiftDate: '2026-09-08',
    exception: { agentEmail: roster[0].email, shiftDate: '2026-09-07', kind: 'holiday_off' },
  })
  assert.equal(holiday.status, 'Holiday Off')
  const missing = resolveAttendanceDay({ rosterAgent: { ...roster[0], off1: '', off2: '' }, date: '2026-09-06', currentShiftDate: '2026-09-08' })
  assert.equal(missing.status, 'No attendance record')
  assert.notEqual(missing.status as string, 'Absent')
})

test('leave and legacy confirmed-absence exceptions resolve to distinct calendar statuses', () => {
  const statusFor = (kind: 'vacation_leave' | 'sick_leave' | 'absent' | 'leave') => resolveAttendanceDay({
    rosterAgent: { ...roster[0], off1: '', off2: '' },
    date: '2026-09-07',
    currentShiftDate: '2026-09-08',
    exception: { agentEmail: roster[0].email, shiftDate: '2026-09-07', kind },
  }).status
  assert.equal(statusFor('vacation_leave'), 'Vacation Leave')
  assert.equal(statusFor('leave'), 'Vacation Leave')
  assert.equal(statusFor('sick_leave'), 'Sick Leave')
  assert.equal(statusFor('absent'), 'Absent')
})

test('attendance on a scheduled rest day is labeled RDOT and retains tracker times', () => {
  const rdot = resolveAttendanceDay({
    rosterAgent: roster[0],
    date: '2026-09-06',
    currentShiftDate: '2026-09-07',
    attendance: {
      agent: roster[0].email,
      shift_date: '2026-09-06',
      time_in: '2026-09-06 21:00:00',
      time_out: '2026-09-07 06:00:00',
    },
  })
  assert.equal(rdot.status, 'RDOT - Complete')
  const output = buildTrackerColumn([rdot])
  assert.deepEqual(output.values, ['21:00:00', '06:00:00'])

  const holiday = resolveAttendanceDay({
    rosterAgent: roster[0],
    date: '2026-09-06',
    currentShiftDate: '2026-09-07',
    attendance: rdot.timeIn ? {
      agent: rdot.agent,
      shift_date: rdot.shiftDate,
      time_in: rdot.timeIn,
      time_out: rdot.timeOut,
    } : undefined,
    exception: { agentEmail: roster[0].email, shiftDate: '2026-09-06', kind: 'holiday_off' },
  })
  assert.equal(holiday.status, 'Holiday Off')
})

test('three-letter roster weekdays resolve as Day Off', () => {
  const dayOff = resolveAttendanceDay({
    rosterAgent: { ...roster[0], off1: 'Sun', off2: 'Sat' },
    date: '2026-09-06',
    currentShiftDate: '2026-09-07',
  })
  assert.equal(dayOff.status, 'Day Off')
})

test('later schedule snapshots supersede without changing earlier dates, including staggered cohorts', () => {
  const versions = [
    { id: 'sept7', effectiveFrom: '2026-09-07', createdAt: '2026-09-01T00:00:00Z', entries: [] },
    { id: 'sept8', effectiveFrom: '2026-09-08', createdAt: '2026-09-01T00:01:00Z', entries: [] },
    { id: 'sept14', effectiveFrom: '2026-09-14', createdAt: '2026-09-01T00:02:00Z', entries: [] },
    { id: 'sept15', effectiveFrom: '2026-09-15', createdAt: '2026-09-01T00:03:00Z', entries: [] },
  ]
  assert.equal(findEffectiveSchedule(versions, '2026-09-07')?.id, 'sept7')
  assert.equal(findEffectiveSchedule(versions, '2026-09-13')?.id, 'sept8')
  assert.equal(findEffectiveSchedule(versions, '2026-09-14')?.id, 'sept14')
  assert.equal(findEffectiveSchedule(versions, '2026-09-15')?.id, 'sept15')
})

test('prepare revert restores only agents changed by the selected schedule version', () => {
  const previous = {
    id: 'regular',
    effectiveFrom: '2026-09-01',
    createdAt: '2026-09-01T00:00:00Z',
    entries: roster.map((agent) => ({ ...agent })),
  }
  const temporary = {
    id: 'temporary',
    effectiveFrom: '2026-09-07',
    createdAt: '2026-09-07T00:00:00Z',
    entries: roster.map((agent) => agent.email === 'carla@example.com'
      ? { ...agent, startShift: '19:00', endShift: '04:00', off1: 'Monday', off2: 'Tuesday' }
      : { ...agent }),
  }
  const changes = buildScheduleRevertChanges(temporary, previous, roster)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].email, 'carla@example.com')
  assert.deepEqual(changes[0].restore, {
    startShift: '21:00',
    endShift: '06:00',
    off1: 'Saturday',
    off2: 'Sunday',
    shiftGroup: 'normal_graveyard',
  })
})

test('tracker output alternates Time In/Out and puts canonical off labels on the first row', () => {
  const complete = resolveAttendanceDay({ rosterAgent: roster[0], date: '2026-09-07', currentShiftDate: '2026-09-07', attendance: { agent: roster[0].email, shift_date: '2026-09-07', time_in: '2026-09-07 21:00:00', time_out: '2026-09-08 06:00:00' } })
  const transition = resolveAttendanceDay({ rosterAgent: roster[1], date: '2026-09-08', currentShiftDate: '2026-09-08', exception: { agentEmail: roster[1].email, shiftDate: '2026-09-08', kind: 'transition_off' } })
  const output = buildTrackerColumn([complete, transition])
  assert.deepEqual(output.values, ['21:00:00', '06:00:00', 'TRANSITION OFF', ''])
  assert.equal(output.rowCount, 4)
})

test('only the defined management roles can use attendance writes', () => {
  for (const role of ['Admin', 'Manager', 'Operations Manager', 'Supervisor', 'Team Leader']) assert.equal(canManageAttendance(role), true)
  assert.equal(canManageAttendance('Agent'), false)
  assert.equal(canManageAttendance('IT'), false)
})

test('attendance roster accepts operational channel positions and excludes management rows', () => {
  for (const role of ['Agent', 'Phone', 'Email', 'Chat', 'Blended']) {
    assert.equal(isAttendanceRosterRole(role), true)
  }
  for (const role of ['Admin', 'Manager', 'Operations Manager', 'Supervisor', 'Team Leader', 'IT', null]) {
    assert.equal(isAttendanceRosterRole(role), false)
  }
})
