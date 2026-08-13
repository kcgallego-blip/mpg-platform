import * as XLSX from 'xlsx'

export type SurveyCsat = 'Unsatisfied' | 'Neutral' | 'Satisfied'

export type RawSurveyRow = Record<string, unknown>

export type SurveyImportRecord = {
  survey_date: string | null
  response_id: string
  agent: string
  csat: SurveyCsat
  mod_comment: string | null
  open_comment: string | null
}

const ALLOWED_CSAT = new Set<SurveyCsat>(['Unsatisfied', 'Neutral', 'Satisfied'])

const toText = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const getHeaderValue = (row: RawSurveyRow, ...headers: string[]) => {
  const normalizedHeaders = new Set(headers.map(normalizeHeader))
  const foundKey = Object.keys(row).find(key => normalizedHeaders.has(normalizeHeader(key)))
  return foundKey ? row[foundKey] : undefined
}

const joinUniqueText = (values: unknown[]) => {
  const uniqueValues = Array.from(new Set(values.map(toText).filter(Boolean)))
  return uniqueValues.join('\n\n')
}

export const findSurveyHeaderRowIndex = (rows: unknown[][]) => rows.findIndex(row => {
  const headers = new Set(row.map(value => normalizeHeader(toText(value))))
  const hasId = headers.has('id') || headers.has('responseid')
  const hasAgent = headers.has('agent') || headers.has('agentname')
  return hasId && hasAgent && headers.has('csat')
})

const normalizeCsat = (value: unknown): SurveyCsat | '' => {
  const text = toText(value).toLowerCase()
  if (text === 'unsatisfied') return 'Unsatisfied'
  if (text === 'neutral') return 'Neutral'
  if (text === 'satisfied') return 'Satisfied'
  return ''
}

const parseExcelDate = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }

  const text = String(value).trim()
  const dateMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)

  if (dateMatch) {
    const isYearFirst = dateMatch[1].length === 4
    const year = isYearFirst ? Number(dateMatch[1]) : Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3])
    const month = Number(isYearFirst ? dateMatch[2] : dateMatch[1])
    const day = Number(isYearFirst ? dateMatch[3] : dateMatch[2])

    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  const parsedDate = new Date(text)
  if (Number.isNaN(parsedDate.getTime())) return null

  return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`
}

export const getSurveyKey = (record: Pick<SurveyImportRecord, 'agent' | 'response_id'>) =>
  `${record.agent.trim().toLowerCase()}::${record.response_id.trim().toLowerCase()}`

export function parseSurveyImportRows(rows: RawSurveyRow[]) {
  const records: SurveyImportRecord[] = []
  let skippedSatisfiedWithoutComment = 0
  let skippedInvalid = 0

  for (const row of rows) {
    const csat = normalizeCsat(getHeaderValue(row, 'CSAT'))
    const responseId = toText(getHeaderValue(row, 'ID', 'Response ID'))
    const agent = toText(getHeaderValue(row, 'Agent', 'Agent Name'))
    const modComment = joinUniqueText([
      getHeaderValue(row, 'MOD Comment', 'MOD Comments'),
      getHeaderValue(row, 'MOD Positive', 'MOD Positive Comment'),
      getHeaderValue(row, 'MOD Negative', 'MOD Negative Comment'),
    ])
    const openComment = toText(getHeaderValue(row, 'Open Comment', 'Open Comments'))

    if (!responseId || !agent || !csat || !ALLOWED_CSAT.has(csat)) {
      skippedInvalid += 1
      continue
    }

    if (csat === 'Satisfied' && !modComment && !openComment) {
      skippedSatisfiedWithoutComment += 1
      continue
    }

    records.push({
      survey_date: parseExcelDate(getHeaderValue(row, 'Date', 'Survey Date')),
      response_id: responseId,
      agent,
      csat,
      mod_comment: modComment || null,
      open_comment: openComment || null,
    })
  }

  return { records, skippedSatisfiedWithoutComment, skippedInvalid }
}

export function mergeSurveyUploadDuplicates(records: SurveyImportRecord[]) {
  const recordMap = new Map<string, SurveyImportRecord>()
  let duplicateRowsInUpload = 0

  for (const record of records) {
    const key = getSurveyKey(record)
    const previous = recordMap.get(key)

    if (!previous) {
      recordMap.set(key, record)
      continue
    }

    duplicateRowsInUpload += 1
    recordMap.set(key, {
      ...previous,
      survey_date: record.survey_date || previous.survey_date,
      csat: record.csat,
      mod_comment: record.mod_comment || previous.mod_comment,
      open_comment: record.open_comment || previous.open_comment,
    })
  }

  return { records: Array.from(recordMap.values()), duplicateRowsInUpload }
}

export function mergeExistingSurveyRecord(
  existing: SurveyImportRecord,
  incoming: SurveyImportRecord
): SurveyImportRecord {
  return {
    survey_date: incoming.survey_date || existing.survey_date,
    response_id: existing.response_id,
    agent: existing.agent,
    csat: incoming.csat,
    mod_comment: incoming.mod_comment || existing.mod_comment,
    open_comment: incoming.open_comment || existing.open_comment,
  }
}

export function surveyImportRecordsEqual(left: SurveyImportRecord, right: SurveyImportRecord) {
  return left.survey_date === right.survey_date
    && left.response_id === right.response_id
    && left.agent === right.agent
    && left.csat === right.csat
    && left.mod_comment === right.mod_comment
    && left.open_comment === right.open_comment
}
