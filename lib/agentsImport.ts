export const EXPECTED_AGENT_IMPORT_FILE = "AUGUST SCHEDULE - August' 26 Schedule.csv"

export const AGENT_IMPORT_FIELDS = [
  'name',
  'email',
  'team_leader',
  'role',
  'off_1',
  'off_2',
  'start_shift',
  'end_shift',
  'comments',
] as const

export type AgentImportField = (typeof AGENT_IMPORT_FIELDS)[number]

export type ImportedAgent = {
  name: string
} & Partial<Record<Exclude<AgentImportField, 'name'>, string | null>>

export type ImportedAgentMatch = {
  incoming: ImportedAgent
  existingName: string
  score: number
}

export type ImportMatchResult<ExistingAgent extends { name: string }> = {
  matches: ImportedAgentMatch[]
  unmatchedNew: ImportedAgent[]
  missingOld: ExistingAgent[]
}

type HeaderTarget = AgentImportField | 'days_off' | 'shift_range'

const headerAliases: Record<string, HeaderTarget> = {
  agent: 'name',
  agentname: 'name',
  employeename: 'name',
  fullname: 'name',
  name: 'name',
  agentemail: 'email',
  agentemailaddress: 'email',
  companyemail: 'email',
  email: 'email',
  emailaddress: 'email',
  workemail: 'email',
  supervisor: 'team_leader',
  teamlead: 'team_leader',
  teamleader: 'team_leader',
  teamleadername: 'team_leader',
  tl: 'team_leader',
  tlname: 'team_leader',
  leader: 'team_leader',
  jobtitle: 'role',
  position: 'role',
  role: 'role',
  dayoff1: 'off_1',
  daysoff1: 'off_1',
  day1off: 'off_1',
  dayoffone: 'off_1',
  firstdayoff: 'off_1',
  firstoff: 'off_1',
  off1: 'off_1',
  restday1: 'off_1',
  dayoff2: 'off_2',
  daysoff2: 'off_2',
  day2off: 'off_2',
  dayofftwo: 'off_2',
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
  shiftstartandend: 'shift_range',
  shiftstartend: 'shift_range',
  shiftschedule: 'shift_range',
  shifttime: 'shift_range',
  startandendshift: 'shift_range',
  startendshift: 'shift_range',
  startendshifts: 'shift_range',
  workhours: 'shift_range',
  comment: 'comments',
  comments: 'comments',
  notes: 'comments',
  remarks: 'comments',
}

export const normalizeAgentHeader = (value: string) =>
  value
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')

export const normalizeAgentName = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const cellToString = (value: unknown) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()

const resolveHeader = (value: unknown): HeaderTarget | null => {
  const normalized = normalizeAgentHeader(cellToString(value))
  if (!normalized) return null
  if (headerAliases[normalized]) return headerAliases[normalized]

  if (normalized.includes('email')) return 'email'
  if (normalized.includes('teamleader') || normalized === 'supervisorname') return 'team_leader'
  if (normalized.includes('daysoff') || normalized.includes('offdays')) return 'days_off'
  if (normalized.includes('start') && normalized.includes('shift')) return 'start_shift'
  if (normalized.includes('end') && normalized.includes('shift')) return 'end_shift'
  if (normalized.includes('shift') && normalized.includes('time')) return 'shift_range'
  if (normalized.includes('comment') || normalized.includes('remark')) return 'comments'

  return null
}

const splitDaysOff = (value: string): [string | null, string | null] => {
  const dayMatches = value.match(
    /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi
  )

  if (dayMatches && dayMatches.length > 0) {
    return [dayMatches[0] || null, dayMatches[1] || null]
  }

  const parts = value
    .split(/\s*(?:,|\/|\||&|\+|\band\b|\bto\b|\s[-–—]\s)\s*/i)
    .map(part => part.trim())
    .filter(Boolean)

  return [parts[0] || null, parts[1] || null]
}

const splitShiftRange = (value: string): [string | null, string | null] => {
  const timeMatches = value.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?\b/gi)
  if (timeMatches && timeMatches.length >= 2) {
    return [timeMatches[0].trim(), timeMatches[1].trim()]
  }

  const parts = value
    .split(/\s*(?:\bto\b|[-–—]|\||\/)\s*/i)
    .map(part => part.trim())
    .filter(Boolean)

  return [parts[0] || null, parts[1] || null]
}

type HeaderCandidate = {
  rowIndex: number
  targets: Array<HeaderTarget | null>
  score: number
}

const getHeaderCandidate = (row: unknown[], rowIndex: number): HeaderCandidate | null => {
  const targets = row.map(resolveHeader)
  const uniqueTargets = new Set(targets.filter((target): target is HeaderTarget => Boolean(target)))
  const hasName = uniqueTargets.has('name')
  const hasEmail = uniqueTargets.has('email')
  const hasDaysOff =
    uniqueTargets.has('days_off') || (uniqueTargets.has('off_1') && uniqueTargets.has('off_2'))
  const hasShift =
    uniqueTargets.has('shift_range') ||
    (uniqueTargets.has('start_shift') && uniqueTargets.has('end_shift'))
  const hasCoreAgentFields = ['team_leader', 'role', 'comments'].every(target =>
    uniqueTargets.has(target as HeaderTarget)
  )
  const score = uniqueTargets.size

  return hasName && hasEmail && hasDaysOff && hasShift && hasCoreAgentFields
    ? { rowIndex, targets, score }
    : null
}

const findHeader = (matrix: unknown[][]): HeaderCandidate => {
  let bestCandidate: HeaderCandidate | null = null
  const rowsToInspect = Math.min(matrix.length, 30)

  for (let rowIndex = 0; rowIndex < rowsToInspect; rowIndex += 1) {
    const directCandidate = getHeaderCandidate(matrix[rowIndex] || [], rowIndex)
    if (directCandidate && (!bestCandidate || directCandidate.score > bestCandidate.score)) {
      bestCandidate = directCandidate
    }

    if (rowIndex === 0) continue
    const previousRow = matrix[rowIndex - 1] || []
    const currentRow = matrix[rowIndex] || []
    const combinedLength = Math.max(previousRow.length, currentRow.length)
    const combinedRow = Array.from({ length: combinedLength }, (_, index) =>
      `${cellToString(previousRow[index])} ${cellToString(currentRow[index])}`.trim()
    )
    const combinedCandidate = getHeaderCandidate(combinedRow, rowIndex)
    if (combinedCandidate && (!bestCandidate || combinedCandidate.score > bestCandidate.score)) {
      bestCandidate = combinedCandidate
    }
  }

  if (!bestCandidate) {
    throw new Error(
      'Could not find the August schedule header row. Expected Name, Email, Team Leader, Role, days off, shift, and comments columns.'
    )
  }

  return bestCandidate
}

export const parseAgentScheduleMatrix = (matrix: unknown[][]): ImportedAgent[] => {
  if (matrix.length < 2) {
    throw new Error('The schedule must include a header row and at least one agent row')
  }

  const { rowIndex: headerRowIndex, targets } = findHeader(matrix)
  const rows: ImportedAgent[] = []
  const seenNames = new Set<string>()

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] || []
    const record: Partial<Record<AgentImportField, string | null>> = {}
    let combinedDaysOff: string | null = null
    let combinedShift: string | null = null

    targets.forEach((target, columnIndex) => {
      if (!target) return
      const value = cellToString(values[columnIndex])
      if (target === 'days_off') {
        combinedDaysOff = value || null
      } else if (target === 'shift_range') {
        combinedShift = value || null
      } else {
        record[target] = value || null
      }
    })

    if (combinedDaysOff) {
      const [firstDayOff, secondDayOff] = splitDaysOff(combinedDaysOff)
      record.off_1 ||= firstDayOff
      record.off_2 ||= secondDayOff
    }

    if (combinedShift) {
      const [startShift, endShift] = splitShiftRange(combinedShift)
      record.start_shift ||= startShift
      record.end_shift ||= endShift
    }

    const name = record.name?.trim() || ''
    if (!name) continue

    const normalizedName = normalizeAgentName(name)
    if (seenNames.has(normalizedName)) {
      throw new Error(`Duplicate agent name in schedule: ${name}`)
    }

    seenNames.add(normalizedName)
    rows.push({ ...record, name } as ImportedAgent)
  }

  if (rows.length === 0) {
    throw new Error('The schedule does not contain any agent rows')
  }

  return rows
}

export const matchImportedAgents = <ExistingAgent extends { name: string }>(
  rows: ImportedAgent[],
  existingAgents: ExistingAgent[],
  getScore: (existingName: string, incomingName: string) => number,
  fuzzyThreshold = 80
): ImportMatchResult<ExistingAgent> => {
  const matches: ImportedAgentMatch[] = []
  const usedExistingNames = new Set<string>()
  const unmatchedRows: ImportedAgent[] = []
  const existingByNormalizedName = new Map(
    existingAgents.map(agent => [normalizeAgentName(agent.name), agent])
  )

  rows.forEach(incoming => {
    const exact = existingByNormalizedName.get(normalizeAgentName(incoming.name))
    if (exact && !usedExistingNames.has(exact.name)) {
      matches.push({ incoming, existingName: exact.name, score: 100 })
      usedExistingNames.add(exact.name)
    } else {
      unmatchedRows.push(incoming)
    }
  })

  const remainingRows = new Set(unmatchedRows)
  const remainingExisting = new Set(
    existingAgents.filter(agent => !usedExistingNames.has(agent.name))
  )

  let foundMatch = true
  while (foundMatch && remainingRows.size > 0 && remainingExisting.size > 0) {
    foundMatch = false
    const candidates = Array.from(remainingRows).flatMap(incoming =>
      Array.from(remainingExisting)
        .map(existing => ({ incoming, existing, score: getScore(existing.name, incoming.name) }))
        .filter(candidate => candidate.score >= fuzzyThreshold)
    )

    const sortedForIncoming = (incoming: ImportedAgent) =>
      candidates
        .filter(candidate => candidate.incoming === incoming)
        .sort((first, second) => second.score - first.score)
    const sortedForExisting = (existing: ExistingAgent) =>
      candidates
        .filter(candidate => candidate.existing === existing)
        .sort((first, second) => second.score - first.score)

    for (const incoming of Array.from(remainingRows)) {
      const incomingCandidates = sortedForIncoming(incoming)
      const best = incomingCandidates[0]
      if (!best) continue

      const existingCandidates = sortedForExisting(best.existing)
      const isMutualBest = existingCandidates[0]?.incoming === incoming
      const incomingMargin = best.score - (incomingCandidates[1]?.score ?? 0)
      const existingMargin = best.score - (existingCandidates[1]?.score ?? 0)

      if (!isMutualBest || incomingMargin < 5 || existingMargin < 5) continue

      matches.push({
        incoming,
        existingName: best.existing.name,
        score: best.score,
      })
      remainingRows.delete(incoming)
      remainingExisting.delete(best.existing)
      foundMatch = true
    }
  }

  return {
    matches,
    unmatchedNew: Array.from(remainingRows),
    missingOld: Array.from(remainingExisting),
  }
}
