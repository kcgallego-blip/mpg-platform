import {
  exceptionStatus,
  formatAttendanceTime,
  getDefaultShiftDate,
  getOperationalCalendarDate,
  getWeekdayForDateKey,
  isDateKey,
  normalizeEmail,
  normalizePersonName,
  normalizeWeekday,
} from './attendance.ts'
import type {
  AttendanceDayStatus,
  AttendanceDayOutcome,
  AttendanceOutcomeValue,
  AttendanceRecord,
  OvertimeReviewStatus,
  ResolvedAttendanceDay,
  RosterAttendanceAgent,
  ScheduleException,
  ScheduleSnapshotEntry,
} from './attendance.ts'

export type FormAction = 'time_in' | 'time_out'
export type SubmittedFormAction = FormAction | 'overtime_in' | 'overtime_out'
export type MistagResolution = 'keep_duplicates' | 'reinterpret'
export type OvertimeResolution = 'confirm' | 'not_overtime'
export type AbsenceResolution = AttendanceOutcomeValue

export type ParsedFormRow = {
  rowNumber: number
  displayedTimestamp: string
  databaseTimestamp: string
  email: string
  pastedName: string
  action: FormAction
  submittedAction: SubmittedFormAction
  teamLeader: string
}

export type ImportIssue = { rowNumber?: number; email?: string; message: string; blocking: boolean }

export type AbsenceReview = {
  email: string
  agentName: string
  shiftDate: string
  startShift: string
  resolution: AbsenceResolution | null
}

export type ImportAgentPreview = {
  email: string
  agentName: string
  shiftDate: string
  pastedName: string
  timeIn: string | null
  timeOut: string | null
  existingTimeIn: string | null
  existingTimeOut: string | null
  existingPreShiftOtApproved: boolean
  existingPostShiftOtApproved: boolean
  existingPreShiftOtReview: OvertimeReviewStatus
  existingPostShiftOtReview: OvertimeReviewStatus
  expectedUpdatedAt: string | null
  nameWarning: string | null
  scheduleWarning: string | null
  missing: FormAction[]
  duplicateActions: FormAction[]
  duplicateDetails: Array<{
    action: FormAction
    count: number
    gapMinutes: number
    selectedTimestamp: string
  }>
  suspectedMistag: {
    duplicatedAction: FormAction
    gapMinutes: number
    proposedTimeIn: string
    proposedTimeOut: string
    resolution: MistagResolution | null
  } | null
  conflicts: FormAction[]
  overtimeReview: {
    preShift: { minutes: number; resolution: OvertimeResolution | null } | null
    postShift: { minutes: number; resolution: OvertimeResolution | null } | null
  }
}

export type ImportIdentityReview = {
  key: string
  reason: 'unknown_email' | 'email_name_conflict'
  pastedEmail: string
  pastedName: string
  pastedTeamLeader: string
  rowNumbers: number[]
  candidates: ImportIdentityCandidate[]
}

export type ImportIdentityCandidate = {
  email: string
  name: string
  score: number
  emailMatch: boolean
  teamLeaderMatch: boolean | null
  scheduleEvidence: string
}

export const REJECT_IMPORT_IDENTITY = '__reject__'

export const MISTAG_REVIEW_MINUTES = 120
export const OVERTIME_REVIEW_MINUTES = 120
export const ABSENCE_GRACE_MINUTES = 60

export type ScheduleVersion = {
  id: string
  effectiveFrom: string
  createdAt: string
  entries: ScheduleSnapshotEntry[]
}

const splitPastedLine = (line: string) => {
  if (line.includes('\t')) return line.split('\t').map((value) => value.trim())
  if (line.includes('|')) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    return trimmed.split('|').map((value) => value.trim())
  }
  return [line.trim()]
}

const isMarkdownSeparator = (values: string[]) =>
  values.length > 1 && values.every((value) => /^:?-{3,}:?$/.test(value.replace(/\s/g, '')))

const isHeader = (values: string[]) => {
  const normalized = values.map(normalizePersonName)
  return ['timestamp', 'email', 'agent name', 'action'].every((word) =>
    normalized.some((value) => value === word)
  )
}

const parseDisplayedTimestamp = (value: string) => {
  const match = value.trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  )
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  let hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] || 0)
  const suffix = match[7]?.toLowerCase()

  if (month < 1 || month > 12 || minute > 59 || second > 59) return null
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    if (suffix === 'am') hour %= 12
    if (suffix === 'pm') hour = (hour % 12) + 12
  } else if (hour > 23) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

export const parseGoogleFormPaste = (rawText: string) => {
  const rows: ParsedFormRow[] = []
  const issues: ImportIssue[] = []
  rawText.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const values = splitPastedLine(line)
    if (isHeader(values) || isMarkdownSeparator(values)) return
    if (values.length !== 5) {
      issues.push({ rowNumber: index + 1, message: 'Expected exactly five columns.', blocking: true })
      return
    }
    const [displayedTimestamp, rawEmail, pastedName, rawAction, teamLeader] = values
    const databaseTimestamp = parseDisplayedTimestamp(displayedTimestamp)
    const email = normalizeEmail(rawEmail.replace(/^mailto:/i, ''))
    const actionKey = normalizePersonName(rawAction).replace(/\s/g, '_') as SubmittedFormAction
    const submittedAction = (['time_in', 'time_out', 'overtime_in', 'overtime_out'] as SubmittedFormAction[])
      .includes(actionKey) ? actionKey : null
    const action: FormAction | null = submittedAction === 'time_in' || submittedAction === 'overtime_in'
      ? 'time_in'
      : submittedAction === 'time_out' || submittedAction === 'overtime_out'
        ? 'time_out'
        : null

    if (!databaseTimestamp) issues.push({ rowNumber: index + 1, message: 'Timestamp is invalid.', blocking: true })
    if (!/^\S+@\S+\.\S+$/.test(email)) issues.push({ rowNumber: index + 1, message: 'Email is invalid.', blocking: true })
    if (!pastedName.trim()) issues.push({ rowNumber: index + 1, message: 'Agent name is required.', blocking: true })
    if (!action) issues.push({ rowNumber: index + 1, message: 'Action must be Time IN, Time OUT, OVERTIME IN, or OVERTIME OUT.', blocking: true })

    if (databaseTimestamp && /^\S+@\S+\.\S+$/.test(email) && pastedName.trim() && action && submittedAction) {
      rows.push({ rowNumber: index + 1, displayedTimestamp: displayedTimestamp.trim(), databaseTimestamp, email, pastedName: pastedName.trim(), action, submittedAction, teamLeader: teamLeader.trim() })
    }
  })
  if (!rows.length && !issues.length) issues.push({ message: 'Paste at least one Google Form response row.', blocking: true })
  return { rows, issues }
}

const timestampValue = (timestamp: string) => Date.parse(`${timestamp.replace(' ', 'T')}Z`)

const getIdentityScheduleEvidence = (row: ParsedFormRow, day?: ResolvedAttendanceDay) => {
  if (!day) return 'No resolved schedule for this shift date'
  const weekday = getWeekdayForDateKey(day.shiftDate)
  const scheduledRestDay = [day.off1, day.off2].map(normalizeWeekday).includes(weekday)
  if (day.exceptionKind === 'day_off' || (!day.exceptionKind && scheduledRestDay)) {
    return 'Scheduled Day Off — possible RDOT'
  }
  if (day.exceptionKind === 'holiday_off') return 'Holiday Off'
  if (day.exceptionKind === 'leave' || day.exceptionKind === 'vacation_leave') return 'Vacation Leave'
  if (day.exceptionKind === 'sick_leave') return 'Sick Leave'
  if (day.exceptionKind === 'absent') return 'Absent'
  if (day.exceptionKind === 'transition_off') return 'Transition Off'

  const scheduledClock = row.action === 'time_in' ? day.startShift : day.endShift
  if (scheduledClockMinutes(scheduledClock) === null || !Number.isFinite(timestampValue(row.databaseTimestamp))) {
    return `Scheduled ${day.startShift || '—'}–${day.endShift || '—'}`
  }
  const timing = getAttendanceTiming({
    shiftDate: day.shiftDate,
    startShift: day.startShift,
    endShift: day.endShift,
    timeIn: row.action === 'time_in' ? row.databaseTimestamp : null,
    timeOut: row.action === 'time_out' ? row.databaseTimestamp : null,
  })
  const label = row.action === 'time_in' ? 'Time In' : 'Time Out'
  const earlyOrUnder = row.action === 'time_in' ? timing.preShiftOtMinutes : timing.undertimeMinutes
  const lateOrOver = row.action === 'time_in' ? timing.lateMinutes : timing.postShiftOtMinutes
  if (earlyOrUnder > 0) return `${earlyOrUnder} min ${row.action === 'time_in' ? 'early' : 'undertime'} from scheduled ${label} (${scheduledClock})`
  if (lateOrOver > 0) return `${lateOrOver} min ${row.action === 'time_in' ? 'late' : 'after'} scheduled ${label} (${scheduledClock})`
  return `On scheduled ${label} (${scheduledClock})`
}

const isResolvedRestDay = (day?: ResolvedAttendanceDay) => {
  if (!day) return false
  const weekday = getWeekdayForDateKey(day.shiftDate)
  return day.exceptionKind === 'day_off'
    || (!day.exceptionKind && [day.off1, day.off2].map(normalizeWeekday).includes(weekday))
}

const buildIdentityCandidate = (
  agent: RosterAttendanceAgent,
  row: ParsedFormRow,
  resolvedDayByKey: Map<string, ResolvedAttendanceDay>,
  baseShiftDate: string | null,
  emailMatch: boolean
): ImportIdentityCandidate => ({
  email: agent.email,
  name: agent.name,
  score: getAttendanceNameScore(agent.name, row.pastedName),
  emailMatch,
  teamLeaderMatch: row.teamLeader.trim()
    ? normalizePersonName(row.teamLeader) === normalizePersonName(agent.teamLeader)
    : null,
  scheduleEvidence: getIdentityScheduleEvidence(row, getImportResolvedDay(agent, resolvedDayByKey, baseShiftDate)),
})

const getImportResolvedDay = (
  agent: RosterAttendanceAgent,
  resolvedDayByKey: Map<string, ResolvedAttendanceDay>,
  baseShiftDate: string | null
) => {
  if (!baseShiftDate) return Array.from(resolvedDayByKey.values()).find((day) => day.agent === agent.email)
  const agentDays = Array.from(resolvedDayByKey.values()).filter((day) => day.agent === agent.email)
  if (agentDays.length === 1) return agentDays[0]
  const baseDay = resolvedDayByKey.get(`${agent.email}|${baseShiftDate}`)
  const calendarDate = getOperationalCalendarDate(baseShiftDate, baseDay?.shiftGroup || agent.shiftGroup)
  return resolvedDayByKey.get(`${agent.email}|${calendarDate}`)
}

export const buildAbsenceReviews = ({ days, importedAttendanceEmails = [], resolutions = {} }: {
  days: ResolvedAttendanceDay[]
  importedAttendanceEmails?: string[]
  resolutions?: Record<string, AbsenceResolution>
}) => {
  const imported = new Set(importedAttendanceEmails.map(normalizeEmail))
  return days
    .filter((day) => day.status === 'Absence Confirmation Required' && !imported.has(day.agent))
    .map((day): AbsenceReview => {
      const requested = resolutions[day.agent]
      return {
        email: day.agent,
        agentName: day.agentName,
        shiftDate: day.shiftDate,
        startShift: day.startShift,
        resolution: requested === 'confirmed_absent' || requested === 'not_absent' ? requested : null,
      }
    })
}

export const buildImportPreview = ({
  rows,
  roster,
  existing,
  resolvedDays = [],
  baseShiftDate = null,
  identityResolutions = {},
  mistagResolutions = {},
  overtimeResolutions = {},
}: {
  rows: ParsedFormRow[]
  roster: RosterAttendanceAgent[]
  existing: AttendanceRecord[]
  resolvedDays?: ResolvedAttendanceDay[]
  baseShiftDate?: string | null
  identityResolutions?: Record<string, string>
  mistagResolutions?: Record<string, MistagResolution>
  overtimeResolutions?: Record<string, Partial<Record<'pre_shift' | 'post_shift', OvertimeResolution>>>
}) => {
  const issues: ImportIssue[] = []
  const rosterByEmail = new Map(roster.map((agent) => [normalizeEmail(agent.email), agent]))
  const existingByKey = new Map(existing.map((record) => [`${normalizeEmail(record.agent)}|${record.shift_date}`, record]))
  const resolvedDayByKey = new Map(resolvedDays.map((day) => [`${normalizeEmail(day.agent)}|${day.shiftDate}`, day]))
  const grouped = new Map<string, ParsedFormRow[]>()
  const identityReviews = new Map<string, ImportIdentityReview>()
  const identityWarnings = new Map<string, string[]>()
  const rejectedIdentityKeys = new Set<string>()

  rows.forEach((row) => {
    const emailAgent = rosterByEmail.get(row.email)
    const rankedByName = roster.map((agent) => ({
      agent,
      score: getAttendanceNameScore(agent.name, row.pastedName),
    })).filter((candidate) => candidate.score > 0)
      .sort((first, second) => second.score - first.score || first.agent.name.localeCompare(second.agent.name))
    const bestName = rankedByName[0]
    const runnerUp = rankedByName[1]
    const confidentDifferentName = emailAgent && bestName && bestName.agent.email !== emailAgent.email
      && bestName.score >= 88 && bestName.score - (runnerUp?.score || 0) >= 5
    const needsReview = !emailAgent || Boolean(confidentDifferentName)
    let resolvedEmail = emailAgent?.email || row.email

    if (needsReview) {
      const reason = emailAgent ? 'email_name_conflict' : 'unknown_email'
      const key = `${reason}|${row.email}|${normalizePersonName(row.pastedName)}`
      const requestedResolution = identityResolutions[key] || ''
      const approvedEmail = normalizeEmail(requestedResolution)
      if (requestedResolution === REJECT_IMPORT_IDENTITY) {
        rejectedIdentityKeys.add(key)
        return
      }
      if (approvedEmail && rosterByEmail.has(approvedEmail)) {
        resolvedEmail = approvedEmail
        identityWarnings.set(resolvedEmail, [
          ...(identityWarnings.get(resolvedEmail) || []),
          reason === 'unknown_email'
            ? `Email ${row.email} was matched by approved name fallback.`
            : `The conflicting email and name were resolved to ${rosterByEmail.get(resolvedEmail)!.name} by uploader approval.`,
        ])
      } else {
        const review = identityReviews.get(key)
        if (review) review.rowNumbers.push(row.rowNumber)
        else {
          const candidateAgents = [
            ...(emailAgent ? [emailAgent] : []),
            ...rankedByName.slice(0, 5).map((candidate) => candidate.agent),
          ].filter((agent, index, all) => all.findIndex((candidate) => candidate.email === agent.email) === index)
          const candidates = candidateAgents.map((agent) =>
            buildIdentityCandidate(agent, row, resolvedDayByKey, baseShiftDate, agent.email === emailAgent?.email)
          )
          identityReviews.set(key, {
            key,
            reason,
            pastedEmail: row.email,
            pastedName: row.pastedName,
            pastedTeamLeader: row.teamLeader,
            rowNumbers: [row.rowNumber],
            candidates,
          })
        }
        return
      }
    }
    grouped.set(resolvedEmail, [...(grouped.get(resolvedEmail) || []), row])
  })

  identityReviews.forEach((review) => issues.push({
    rowNumber: review.rowNumbers[0],
    email: review.pastedEmail,
    message: review.reason === 'unknown_email'
      ? `Email is not in the roster. Approve an identity match for ${review.pastedName}.`
      : `Email belongs to one roster agent while the submitted name strongly matches another. Approve the correct identity or reject the rows.`,
    blocking: true,
  }))
  rejectedIdentityKeys.forEach((key) => issues.push({
    message: `Uploader rejected the identity for ${key.split('|').at(-1)}; those rows will not be imported.`,
    blocking: false,
  }))

  const agents: ImportAgentPreview[] = []
  grouped.forEach((agentRows, email) => {
    const rosterAgent = rosterByEmail.get(email)!
    const resolvedDay = getImportResolvedDay(rosterAgent, resolvedDayByKey, baseShiftDate)
    const shiftDate = resolvedDay?.shiftDate
      || (baseShiftDate ? getOperationalCalendarDate(baseShiftDate, rosterAgent.shiftGroup) : agentRows[0].databaseTimestamp.slice(0, 10))
    const current = existingByKey.get(`${email}|${shiftDate}`)
    const sortedByAction = {
      time_in: agentRows.filter((row) => row.action === 'time_in')
        .sort((first, second) => timestampValue(first.databaseTimestamp) - timestampValue(second.databaseTimestamp)),
      time_out: agentRows.filter((row) => row.action === 'time_out')
        .sort((first, second) => timestampValue(first.databaseTimestamp) - timestampValue(second.databaseTimestamp)),
    }
    const duplicateActions = (['time_in', 'time_out'] as FormAction[])
      .filter((action) => sortedByAction[action].length > 1)
    const duplicateDetails = duplicateActions.map((action) => {
      const actionRows = sortedByAction[action]
      const gapMinutes = Math.round(
        (timestampValue(actionRows.at(-1)!.databaseTimestamp) - timestampValue(actionRows[0].databaseTimestamp)) / 60_000
      )
      return {
        action,
        count: actionRows.length,
        gapMinutes,
        selectedTimestamp: action === 'time_in'
          ? actionRows.at(-1)!.databaseTimestamp
          : actionRows[0].databaseTimestamp,
      }
    })
    const possibleMistag = duplicateDetails.find((detail) => {
      const opposite = detail.action === 'time_in' ? sortedByAction.time_out : sortedByAction.time_in
      return opposite.length === 0 && detail.gapMinutes >= MISTAG_REVIEW_MINUTES
    })
    const requestedMistagResolution = mistagResolutions[email]
    const mistagResolution: MistagResolution | null =
      requestedMistagResolution === 'keep_duplicates' || requestedMistagResolution === 'reinterpret'
        ? requestedMistagResolution
        : null
    const suspectedMistag = possibleMistag ? {
      duplicatedAction: possibleMistag.action,
      gapMinutes: possibleMistag.gapMinutes,
      proposedTimeIn: sortedByAction[possibleMistag.action][0].databaseTimestamp,
      proposedTimeOut: sortedByAction[possibleMistag.action].at(-1)!.databaseTimestamp,
      resolution: mistagResolution,
    } : null

    duplicateDetails.forEach((detail) => {
      const label = detail.action === 'time_in' ? 'Time In' : 'Time Out'
      if (suspectedMistag?.duplicatedAction === detail.action) {
        issues.push({
          email,
          message: `${label} was submitted ${detail.count} times across ${detail.gapMinutes} minutes. Confirm whether this is a real duplicate or an incorrectly tagged In/Out pair.`,
          blocking: !mistagResolution,
        })
      } else {
        issues.push({
          email,
          message: `${label} was submitted ${detail.count} times within ${detail.gapMinutes} minutes; ${detail.action === 'time_in' ? 'the latest Time In' : 'the earliest Time Out'} is selected.`,
          blocking: false,
        })
      }
    })

    let timeIn = sortedByAction.time_in.at(-1)?.databaseTimestamp || null
    let timeOut = sortedByAction.time_out[0]?.databaseTimestamp || null
    if (suspectedMistag && mistagResolution === 'reinterpret') {
      timeIn = suspectedMistag.proposedTimeIn
      timeOut = suspectedMistag.proposedTimeOut
    }

    const timing = getAttendanceTiming({
      shiftDate,
      startShift: resolvedDay?.startShift || rosterAgent.startShift,
      endShift: resolvedDay?.endShift || rosterAgent.endShift,
      timeIn,
      timeOut,
    })
    const regularScheduledDay = !isResolvedRestDay(resolvedDay)
      && (!resolvedDay?.exceptionKind || resolvedDay.exceptionKind === 'scheduled')
    const requestedOvertime = overtimeResolutions[email] || {}
    const validOvertimeResolution = (value: OvertimeResolution | undefined): OvertimeResolution | null =>
      value === 'confirm' || value === 'not_overtime' ? value : null
    const preShiftResolution = validOvertimeResolution(requestedOvertime.pre_shift)
    const postShiftResolution = validOvertimeResolution(requestedOvertime.post_shift)
    const overtimeReview = {
      preShift: regularScheduledDay && timing.preShiftOtMinutes >= OVERTIME_REVIEW_MINUTES
        ? { minutes: timing.preShiftOtMinutes, resolution: preShiftResolution }
        : null,
      postShift: regularScheduledDay && timing.postShiftOtMinutes >= OVERTIME_REVIEW_MINUTES
        ? { minutes: timing.postShiftOtMinutes, resolution: postShiftResolution }
        : null,
    }
    if (overtimeReview.preShift) issues.push({
      email,
      message: `Time In is ${overtimeReview.preShift.minutes} minutes before the scheduled start. Confirm whether this is Pre-shift OT.`,
      blocking: !preShiftResolution,
    })
    if (overtimeReview.postShift) issues.push({
      email,
      message: `Time Out is ${overtimeReview.postShift.minutes} minutes after the scheduled end. Confirm whether this is Post-shift OT.`,
      blocking: !postShiftResolution,
    })

    const conflicts: FormAction[] = []
    if (timeIn && current?.time_in && current.time_in !== timeIn) conflicts.push('time_in')
    if (timeOut && current?.time_out && current.time_out !== timeOut) conflicts.push('time_out')
    const pastedName = agentRows[0].pastedName
    agents.push({
      email,
      agentName: rosterAgent.name,
      shiftDate,
      pastedName,
      timeIn,
      timeOut,
      existingTimeIn: current?.time_in || null,
      existingTimeOut: current?.time_out || null,
      existingPreShiftOtApproved: Boolean(current?.pre_shift_ot_approved),
      existingPostShiftOtApproved: Boolean(current?.post_shift_ot_approved),
      existingPreShiftOtReview: current?.pre_shift_ot_review || (current?.pre_shift_ot_approved ? 'approved' : 'not_required'),
      existingPostShiftOtReview: current?.post_shift_ot_review || (current?.post_shift_ot_approved ? 'approved' : 'not_required'),
      expectedUpdatedAt: current?.updated_at || null,
      nameWarning: identityWarnings.has(email)
        ? identityWarnings.get(email)!.join(' ')
        : normalizePersonName(pastedName) === normalizePersonName(rosterAgent.name)
          ? null
          : `Pasted name “${pastedName}” differs from roster name “${rosterAgent.name}”.`,
      scheduleWarning: isResolvedRestDay(resolvedDay)
        ? 'Scheduled Day Off — saved attendance will be labeled RDOT and the pasted times will be retained.'
        : null,
      missing: (['time_in', 'time_out'] as FormAction[])
        .filter((action) => action === 'time_in' ? !timeIn : !timeOut),
      duplicateActions,
      duplicateDetails,
      suspectedMistag,
      conflicts,
      overtimeReview,
    })
  })

  return {
    agents: agents.sort((first, second) => first.agentName.localeCompare(second.agentName)),
    issues,
    identityReviews: Array.from(identityReviews.values()),
  }
}

const getTrackerOrderNames = (rawText: string) =>
  rawText.split(/\r?\n/)
    .map((line) => splitPastedLine(line).find((value) => value.trim()) || '')
    .map((value) => value.trim())
    .filter((value) => value && !/^:?-{3,}:?$/.test(value.replace(/\s/g, '')) && normalizePersonName(value) !== 'agent name')

const levenshteinDistance = (first: string, second: string) => {
  const rows = second.length + 1
  const columns = first.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0))
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      matrix[row][column] = second[row - 1] === first[column - 1]
        ? matrix[row - 1][column - 1]
        : Math.min(matrix[row - 1][column - 1], matrix[row][column - 1], matrix[row - 1][column]) + 1
    }
  }
  return matrix[second.length][first.length]
}

export const getAttendanceNameScore = (rosterName: string, pastedName: string) => {
  const rosterNormalized = normalizePersonName(rosterName)
  const pastedNormalized = normalizePersonName(pastedName)
  if (!rosterNormalized || !pastedNormalized) return 0
  if (rosterNormalized === pastedNormalized) return 100
  if (rosterNormalized.includes(pastedNormalized) || pastedNormalized.includes(rosterNormalized)) return 92

  const rosterTokens = rosterNormalized.split(' ').filter(Boolean)
  const pastedTokens = pastedNormalized.split(' ').filter(Boolean)
  const rosterSet = new Set(rosterTokens.filter((token) => token.length > 1))
  const pastedSet = new Set(pastedTokens.filter((token) => token.length > 1))
  const shared = Array.from(pastedSet).filter((token) => rosterSet.has(token))
  const overlap = shared.length / Math.max(Math.min(rosterSet.size, pastedSet.size), 1)
  const sameFirst = rosterTokens[0] === pastedTokens[0]
  const sameLast = rosterTokens.at(-1) === pastedTokens.at(-1)
  if (sameFirst && sameLast) return 90
  if (overlap === 1) return 88
  if (sameLast && overlap >= 0.5) return 84
  if (sameFirst && overlap >= 0.5) return 82

  const maxLength = Math.max(rosterNormalized.length, pastedNormalized.length)
  const similarity = Math.round(((maxLength - levenshteinDistance(rosterNormalized, pastedNormalized)) / maxLength) * 100)
  if (similarity >= 70) return similarity
  if (overlap >= 0.75) return 76
  if (overlap >= 0.5) return 65
  return similarity >= 50 ? similarity : 0
}

export type TrackerOrderCandidate = { email: string; name: string; score: number }
export type TrackerOrderPreviewRow = {
  position: number
  inputName: string
  matchType: 'exact' | 'fuzzy' | 'unresolved'
  selectedEmail: string | null
  candidates: TrackerOrderCandidate[]
}

export const previewTrackerOrder = (rawText: string, roster: RosterAttendanceAgent[]) => {
  const requestedNames = getTrackerOrderNames(rawText)
  const rosterByName = new Map<string, RosterAttendanceAgent[]>()
  roster.forEach((agent) => {
    const key = normalizePersonName(agent.name)
    rosterByName.set(key, [...(rosterByName.get(key) || []), agent])
  })

  const rows: TrackerOrderPreviewRow[] = requestedNames.map((inputName, index) => {
    const exact = rosterByName.get(normalizePersonName(inputName)) || []
    if (exact.length === 1) {
      return {
        position: index + 1,
        inputName,
        matchType: 'exact',
        selectedEmail: exact[0].email,
        candidates: [{ email: exact[0].email, name: exact[0].name, score: 100 }],
      }
    }

    const candidates = roster.map((agent) => ({
      email: agent.email,
      name: agent.name,
      score: getAttendanceNameScore(agent.name, inputName),
    })).filter((candidate) => candidate.score > 0)
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
      .slice(0, 5)
    const best = candidates[0]
    const runnerUp = candidates[1]
    const confident = Boolean(best && best.score >= 70 && best.score - (runnerUp?.score || 0) >= 5)
    return {
      position: index + 1,
      inputName,
      matchType: candidates.length ? 'fuzzy' : 'unresolved',
      selectedEmail: confident ? best.email : null,
      candidates,
    }
  })

  const issues: string[] = []
  if (!requestedNames.length) issues.push('Paste at least one agent name.')
  if (requestedNames.length !== roster.length) {
    issues.push(`Pasted ${requestedNames.length} names, but the active Agent roster contains ${roster.length}.`)
  }
  return { rows, roster, issues }
}

export const validateTrackerOrder = (
  rawText: string,
  roster: RosterAttendanceAgent[],
  selections: Record<string, string> = {}
) => {
  const preview = previewTrackerOrder(rawText, roster)
  const issues: string[] = []
  const resolved: RosterAttendanceAgent[] = []
  const seen = new Set<string>()
  const rosterByEmail = new Map(roster.map((agent) => [agent.email, agent]))
  preview.rows.forEach((row) => {
    const selectedEmail = row.matchType === 'exact'
      ? row.selectedEmail
      : selections[String(row.position)] || null
    const selected = selectedEmail ? rosterByEmail.get(normalizeEmail(selectedEmail)) : null
    if (!selected) issues.push(`Choose a roster match for row ${row.position}: ${row.inputName}`)
    else if (seen.has(selected.email)) issues.push(`Duplicate roster agent selected: ${selected.name}`)
    else {
      seen.add(selected.email)
      resolved.push(selected)
    }
  })
  roster.forEach((agent) => {
    if (!seen.has(agent.email)) issues.push(`Missing active roster agent: ${agent.name}`)
  })
  return { valid: issues.length === 0, agents: resolved, issues }
}

export const resolveAttendanceDay = ({ rosterAgent, date, attendance, schedule, exception, outcome, currentShiftDate = getDefaultShiftDate(), currentTimestamp }: {
  rosterAgent: RosterAttendanceAgent
  date: string
  attendance?: AttendanceRecord
  schedule?: ScheduleSnapshotEntry
  exception?: ScheduleException
  outcome?: AttendanceDayOutcome
  currentShiftDate?: string
  currentTimestamp?: string
}): ResolvedAttendanceDay => {
  const effective = schedule || rosterAgent
  const weekday = getWeekdayForDateKey(date)
  const scheduledDayOff = [effective.off1, effective.off2].map(normalizeWeekday).includes(weekday)
  const offException = exception && exception.kind !== 'scheduled' ? exceptionStatus(exception.kind) : null
  const hasTimeIn = Boolean(attendance?.time_in)
  const hasTimeOut = Boolean(attendance?.time_out)
  const isRdot = (scheduledDayOff && !exception || exception?.kind === 'day_off') && (hasTimeIn || hasTimeOut)
  const effectiveStartShift = exception?.kind === 'scheduled' && exception.startShift ? exception.startShift : effective.startShift
  const effectiveEndShift = exception?.kind === 'scheduled' && exception.endShift ? exception.endShift : effective.endShift
  const timing = getAttendanceTiming({
    shiftDate: date,
    startShift: effectiveStartShift,
    endShift: effectiveEndShift,
    timeIn: attendance?.time_in || null,
    timeOut: attendance?.time_out || null,
  })
  const startMinutes = scheduledClockMinutes(effectiveStartShift)
  const endMinutes = scheduledClockMinutes(effectiveEndShift)
  const scheduledStart = startMinutes === null ? Number.NaN : Date.parse(`${date}T00:00:00Z`) + startMinutes * 60_000
  const scheduledEnd = startMinutes === null || endMinutes === null
    ? Number.NaN
    : Date.parse(`${date}T00:00:00Z`) + endMinutes * 60_000 + (endMinutes <= startMinutes ? 86_400_000 : 0)
  const now = wallClockTimestamp(currentTimestamp || null)
  const minutesSinceStart = Number.isFinite(now) && Number.isFinite(scheduledStart)
    ? Math.floor((now - scheduledStart) / 60_000)
    : null
  const shiftIsStillOpen = Number.isFinite(now) && Number.isFinite(scheduledEnd)
    ? now <= scheduledEnd
    : date === currentShiftDate
  let status: AttendanceDayStatus
  if (isRdot && hasTimeIn && hasTimeOut) status = 'RDOT - Complete'
  else if (isRdot && !hasTimeIn && hasTimeOut) status = 'RDOT - Missing Time In'
  else if (isRdot && hasTimeIn && !hasTimeOut) status = date === currentShiftDate ? 'RDOT - Currently Working' : 'RDOT - Missing Time Out'
  else if (offException) status = offException
  else if (!exception && scheduledDayOff) status = 'Day Off'
  else if (hasTimeIn && hasTimeOut) status = 'Complete'
  else if (!hasTimeIn && hasTimeOut) status = 'Missing Time In'
  else if (hasTimeIn && !hasTimeOut) status = shiftIsStillOpen ? 'Currently Working' : 'Missing Time Out'
  else if (outcome?.outcome === 'confirmed_absent') status = 'Absent'
  else if (outcome?.outcome === 'not_absent') status = 'Not Absent - Missing Attendance'
  else if (minutesSinceStart !== null && minutesSinceStart < 0) status = 'Scheduled'
  else if (minutesSinceStart !== null && minutesSinceStart < ABSENCE_GRACE_MINUTES) status = 'Awaiting Time In'
  else if (minutesSinceStart !== null) status = 'Absence Confirmation Required'
  else status = date < currentShiftDate ? 'No attendance record' : 'Scheduled'

  return {
    agent: rosterAgent.email,
    agentName: rosterAgent.name,
    teamLeader: effective.teamLeader,
    shiftDate: date,
    timeIn: attendance?.time_in || null,
    timeOut: attendance?.time_out || null,
    startShift: effectiveStartShift,
    endShift: effectiveEndShift,
    off1: effective.off1,
    off2: effective.off2,
    shiftGroup: effective.shiftGroup,
    status,
    exceptionKind: exception?.kind || null,
    scheduleSource: exception ? 'exception' : schedule ? 'snapshot' : 'roster',
    attendanceOutcome: outcome?.outcome || null,
    preShiftOtApproved: Boolean(attendance?.pre_shift_ot_approved),
    postShiftOtApproved: Boolean(attendance?.post_shift_ot_approved),
    preShiftOtReview: attendance?.pre_shift_ot_review || (attendance?.pre_shift_ot_approved ? 'approved' : 'not_required'),
    postShiftOtReview: attendance?.post_shift_ot_review || (attendance?.post_shift_ot_approved ? 'approved' : 'not_required'),
    updatedAt: attendance?.updated_at || null,
    ...timing,
  }
}

const scheduledClockMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const suffix = match[3]?.toLowerCase()
  if (minute > 59) return null
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    if (suffix === 'am') hour %= 12
    else hour = (hour % 12) + 12
  } else if (hour > 23) return null
  return hour * 60 + minute
}

const wallClockTimestamp = (value: string | null) => value ? Date.parse(`${value.replace(' ', 'T')}Z`) : Number.NaN

/**
 * An Overnight clock close to midnight can carry the calendar date adjacent
 * to its authoritative shift date. Compare the occurrence of that wall clock
 * nearest to the scheduled boundary without rewriting the timestamp saved for
 * audit/output. Callers apply this only to midnight-through-5:59 AM starts.
 */
const alignClockToScheduledBoundary = (clock: number, scheduledBoundary: number) => {
  if (!Number.isFinite(clock) || !Number.isFinite(scheduledBoundary)) return clock
  const candidates = [clock - 86_400_000, clock, clock + 86_400_000]
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - scheduledBoundary) < Math.abs(nearest - scheduledBoundary) ? candidate : nearest
  )
}

export const getAttendanceTiming = ({ shiftDate, startShift, endShift, timeIn, timeOut }: {
  shiftDate: string
  startShift: string
  endShift: string
  timeIn: string | null
  timeOut: string | null
}) => {
  const startMinutes = scheduledClockMinutes(startShift)
  const endMinutes = scheduledClockMinutes(endShift)
  if (startMinutes === null || endMinutes === null || !isDateKey(shiftDate)) {
    return { preShiftOtMinutes: 0, postShiftOtMinutes: 0, lateMinutes: 0, undertimeMinutes: 0 }
  }
  const dayStart = Date.parse(`${shiftDate}T00:00:00Z`)
  const scheduledStart = dayStart + startMinutes * 60_000
  const scheduledEnd = dayStart + endMinutes * 60_000 + (endMinutes <= startMinutes ? 86_400_000 : 0)
  const isOvernightStart = startMinutes < 6 * 60
  const parsedActualIn = wallClockTimestamp(timeIn)
  const parsedActualOut = wallClockTimestamp(timeOut)
  const actualIn = isOvernightStart
    ? alignClockToScheduledBoundary(parsedActualIn, scheduledStart)
    : parsedActualIn
  const actualOut = isOvernightStart
    ? alignClockToScheduledBoundary(parsedActualOut, scheduledEnd)
    : parsedActualOut
  const roundedMinutes = (milliseconds: number) => Math.max(0, Math.round(milliseconds / 60_000))
  const completedMinutes = (milliseconds: number) => Math.max(0, Math.floor(milliseconds / 60_000))
  return {
    preShiftOtMinutes: Number.isFinite(actualIn) ? roundedMinutes(scheduledStart - actualIn) : 0,
    postShiftOtMinutes: Number.isFinite(actualOut) ? roundedMinutes(actualOut - scheduledEnd) : 0,
    lateMinutes: Number.isFinite(actualIn) ? completedMinutes(actualIn - scheduledStart) : 0,
    undertimeMinutes: Number.isFinite(actualOut) ? roundedMinutes(scheduledEnd - actualOut) : 0,
  }
}

export const buildTrackerColumn = (days: ResolvedAttendanceDay[]) => {
  const offStatuses = new Set<AttendanceDayStatus>(['Day Off', 'Holiday Off', 'Leave', 'Vacation Leave', 'Sick Leave', 'Transition Off', 'Absent'])
  const values: string[] = []
  const lines: Array<{ agentName: string; field: 'Time In' | 'Time Out'; value: string }> = []
  days.forEach((day) => {
    const formattedIn = formatAttendanceTime(day.timeIn)
    const formattedOut = formatAttendanceTime(day.timeOut)
    const first = offStatuses.has(day.status) ? day.status.toUpperCase() : formattedIn === '--' ? '' : formattedIn
    const second = offStatuses.has(day.status) ? '' : formattedOut === '--' ? '' : formattedOut
    values.push(first, second)
    lines.push(
      { agentName: day.agentName, field: 'Time In', value: first },
      { agentName: day.agentName, field: 'Time Out', value: second }
    )
  })
  return { text: values.join('\n'), values, lines, rowCount: values.length }
}

export const findEffectiveSchedule = (versions: ScheduleVersion[], date: string) =>
  versions.filter((version) => isDateKey(version.effectiveFrom) && version.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0]

const scheduleValueFields = ['startShift', 'endShift', 'off1', 'off2', 'shiftGroup'] as const

export type ScheduleRevertChange = {
  email: string
  name: string
  temporary: Pick<ScheduleSnapshotEntry, typeof scheduleValueFields[number]>
  restore: Pick<ScheduleSnapshotEntry, typeof scheduleValueFields[number]>
}

export const buildScheduleRevertChanges = (
  temporaryVersion: ScheduleVersion,
  previousVersion: ScheduleVersion,
  roster: RosterAttendanceAgent[]
): ScheduleRevertChange[] => {
  const temporaryByEmail = new Map(temporaryVersion.entries.map((entry) => [entry.email, entry]))
  const previousByEmail = new Map(previousVersion.entries.map((entry) => [entry.email, entry]))

  return roster.flatMap((agent) => {
    const temporary = temporaryByEmail.get(agent.email)
    const previous = previousByEmail.get(agent.email)
    if (!temporary || !previous) return []
    if (scheduleValueFields.every((field) => temporary[field] === previous[field])) return []
    return [{
      email: agent.email,
      name: agent.name,
      temporary: Object.fromEntries(scheduleValueFields.map((field) => [field, temporary[field]])) as ScheduleRevertChange['temporary'],
      restore: Object.fromEntries(scheduleValueFields.map((field) => [field, previous[field]])) as ScheduleRevertChange['restore'],
    }]
  })
}
