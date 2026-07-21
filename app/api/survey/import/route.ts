import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabase } from '@/lib/supabase'

const ALLOWED_UPLOAD_ROLES = ['admin', 'manager', 'operations manager', 'team leader', 'supervisor']
const ALLOWED_CSAT = new Set(['Unsatisfied', 'Neutral', 'Satisfied'])

type RawSurveyRow = Record<string, unknown>

const toText = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const normalizeCsat = (value: unknown) => {
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

const getHeaderValue = (row: RawSurveyRow, header: string) => {
  const foundKey = Object.keys(row).find(key => key.trim().toLowerCase() === header.toLowerCase())
  return foundKey ? row[foundKey] : undefined
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

    const rows = XLSX.utils.sheet_to_json<RawSurveyRow>(sheet, {
      defval: '',
      raw: false,
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Survey file must include headers and at least one data row' }, { status: 400 })
    }

    const dbRecords = []
    let skippedSatisfiedWithoutMod = 0
    let skippedInvalid = 0

    for (const row of rows) {
      const csat = normalizeCsat(getHeaderValue(row, 'CSAT'))
      const responseId = toText(getHeaderValue(row, 'ID'))
      const agent = toText(getHeaderValue(row, 'Agent'))
      const modComment = toText(getHeaderValue(row, 'MOD Comment'))
      const openComment = toText(getHeaderValue(row, 'Open Comment'))

      if (!responseId || !agent || !ALLOWED_CSAT.has(csat)) {
        skippedInvalid += 1
        continue
      }

      if (csat === 'Satisfied' && !modComment) {
        skippedSatisfiedWithoutMod += 1
        continue
      }

      dbRecords.push({
        survey_date: parseExcelDate(getHeaderValue(row, 'Date')),
        response_id: responseId,
        agent,
        csat,
        mod_comment: modComment || null,
        open_comment: openComment || null,
      })
    }

    if (dbRecords.length === 0) {
      return NextResponse.json(
        {
          error: 'No survey rows matched the ingestion rules',
          skippedSatisfiedWithoutMod,
          skippedInvalid,
        },
        { status: 400 }
      )
    }

    let imported = 0
    const insertedDateValues: string[] = []
    const batchSize = 100

    for (let i = 0; i < dbRecords.length; i += batchSize) {
      const batch = dbRecords.slice(i, i + batchSize)
      const { data, error } = await supabase
        .from('survey')
        .upsert(batch, {
          onConflict: 'agent,response_id',
          ignoreDuplicates: true,
        })
        .select('agent, response_id, survey_date')

      if (error) {
        return NextResponse.json(
          {
            error: `Failed to import survey data: ${error.message}`,
            imported,
            skippedSatisfiedWithoutMod,
            skippedInvalid,
          },
          { status: 500 }
        )
      }

      imported += data?.length || 0
      insertedDateValues.push(...(data || []).map(row => row.survey_date).filter(Boolean))
    }

    const sortedInsertedDates = insertedDateValues.sort()

    return NextResponse.json({
      success: true,
      imported,
      duplicatesSkipped: dbRecords.length - imported,
      skippedSatisfiedWithoutMod,
      skippedInvalid,
      eligibleRows: dbRecords.length,
      importedDateRange: sortedInsertedDates.length > 0
        ? {
            earliest: sortedInsertedDates[0],
            latest: sortedInsertedDates[sortedInsertedDates.length - 1],
          }
        : null,
      message: `Successfully imported ${imported} survey rows`,
    })
  } catch (error: any) {
    console.error('Survey import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import survey data' },
      { status: 500 }
    )
  }
}
