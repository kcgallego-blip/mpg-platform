import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  findSurveyHeaderRowIndex,
  getSurveyKey,
  mergeExistingSurveyRecord,
  mergeSurveyUploadDuplicates,
  parseSurveyImportRows,
  surveyImportRecordsEqual,
  type RawSurveyRow,
  type SurveyImportRecord,
} from '@/lib/surveyImport'

const ALLOWED_UPLOAD_ROLES = ['admin', 'manager', 'operations manager', 'team leader', 'supervisor']

const getDateRange = (records: Array<{ survey_date: string | null }>) => {
  const sortedDates = records
    .map(record => record.survey_date)
    .filter((value): value is string => Boolean(value))
    .sort()

  return sortedDates.length > 0
    ? {
        earliest: sortedDates[0],
        latest: sortedDates[sortedDates.length - 1],
      }
    : null
}

export async function POST(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)

    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userRole = dbUser.role?.toLowerCase()
    if (!ALLOWED_UPLOAD_ROLES.includes(userRole || '')) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin, Manager, Team Leader, or Supervisor only' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing survey file' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Survey upload must be a CSV or XLSX file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, {
      type: 'array',
      cellDates: true,
      raw: false,
    })
    const sheetName = workbook.SheetNames[0]
    const sheet = sheetName ? workbook.Sheets[sheetName] : null

    if (!sheet) {
      return NextResponse.json({ error: 'Uploaded file does not contain a readable sheet' }, { status: 400 })
    }

    const worksheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: true,
    })
    const headerRowIndex = findSurveyHeaderRowIndex(worksheetRows)

    if (headerRowIndex < 0) {
      return NextResponse.json(
        { error: 'Survey file must include Date, ID, Agent, and CSAT headers' },
        { status: 400 }
      )
    }

    const rows = XLSX.utils.sheet_to_json<RawSurveyRow>(sheet, {
      range: headerRowIndex,
      defval: '',
      raw: false,
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Survey file must include headers and at least one data row' }, { status: 400 })
    }

    const {
      records: dbRecords,
      skippedSatisfiedWithoutComment,
      skippedInvalid,
    } = parseSurveyImportRows(rows)

    if (dbRecords.length === 0) {
      return NextResponse.json(
        {
          error: 'No survey rows matched the ingestion rules',
          skippedSatisfiedWithoutComment,
          skippedInvalid,
        },
        { status: 400 }
      )
    }

    const {
      records: uploadUniqueRecords,
      duplicateRowsInUpload,
    } = mergeSurveyUploadDuplicates(dbRecords)

    const existingRecords = new Map<string, SurveyImportRecord>()
    const responseIds = Array.from(new Set(uploadUniqueRecords.map(record => record.response_id)))
    const batchSize = 100

    for (let i = 0; i < responseIds.length; i += batchSize) {
      const responseIdBatch = responseIds.slice(i, i + batchSize)
      const { data, error } = await supabaseAdmin
        .from('survey')
        .select('survey_date, response_id, agent, csat, mod_comment, open_comment')
        .in('response_id', responseIdBatch)

      if (error) {
        return NextResponse.json(
          {
            error: `Failed to check existing survey data: ${error.message}`,
            imported: 0,
            updated: 0,
            skippedSatisfiedWithoutComment,
            skippedInvalid,
          },
          { status: 500 }
        )
      }

      for (const row of (data || []) as SurveyImportRecord[]) {
        existingRecords.set(getSurveyKey(row), row)
      }
    }

    const recordsToWrite: SurveyImportRecord[] = []
    const insertedKeys = new Set<string>()
    let imported = 0
    let updated = 0
    let unchangedExisting = 0

    for (const incoming of uploadUniqueRecords) {
      const key = getSurveyKey(incoming)
      const existing = existingRecords.get(key)

      if (!existing) {
        recordsToWrite.push(incoming)
        insertedKeys.add(key)
        imported += 1
        continue
      }

      const merged = mergeExistingSurveyRecord(existing, incoming)
      if (surveyImportRecordsEqual(existing, merged)) {
        unchangedExisting += 1
        continue
      }

      recordsToWrite.push(merged)
      updated += 1
    }

    const duplicatesSkipped = duplicateRowsInUpload + unchangedExisting
    const writtenRecords: Array<{ agent: string; response_id: string; survey_date: string | null }> = []

    for (let i = 0; i < recordsToWrite.length; i += batchSize) {
      const batch = recordsToWrite.slice(i, i + batchSize)
      const { data, error } = await supabaseAdmin
        .from('survey')
        .upsert(batch, { onConflict: 'agent,response_id' })
        .select('agent, response_id, survey_date')

      if (error) {
        return NextResponse.json(
          {
            error: `Failed to import survey data: ${error.message}`,
            imported,
            updated,
            skippedSatisfiedWithoutComment,
            skippedInvalid,
            duplicatesSkipped,
          },
          { status: 500 }
        )
      }

      writtenRecords.push(...(data || []))
    }

    const insertedRecords = writtenRecords.filter(record => insertedKeys.has(getSurveyKey(record)))
    const message = updated > 0
      ? `Successfully imported ${imported} new survey rows and updated ${updated} existing rows`
      : `Successfully imported ${imported} new survey rows`

    return NextResponse.json({
      success: true,
      imported,
      updated,
      duplicatesSkipped,
      duplicateRowsInUpload,
      unchangedExisting,
      skippedSatisfiedWithoutComment,
      skippedInvalid,
      eligibleRows: dbRecords.length,
      eligibleDateRange: getDateRange(dbRecords),
      importedDateRange: getDateRange(insertedRecords),
      message,
    })
  } catch (error: any) {
    console.error('Survey import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import survey data' },
      { status: 500 }
    )
  }
}
