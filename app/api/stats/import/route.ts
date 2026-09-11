import { NextRequest, NextResponse } from 'next/server'
import { STATS_COLUMNS, STATS_MONTH_COLUMNS } from '@/lib/dbColumns'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { canUploadStats } from '@/lib/statsAccess'
import { getStatsCsvValue } from '@/lib/statsCsv'
import { getHistoricalStatsTeamLeader } from '@/lib/statsHistory'
import {
  resolveStatsRosterEntry,
  resolveStatsTeamLeader,
  type StatsRosterEntry,
} from '@/lib/statsRoster'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const parseWeek = (value: unknown) => {
  const week = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isInteger(week) && week > 0 ? week : null
}

const parseMonth = (value: unknown) => {
  const month = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null
}

const parseRange = (value: unknown) => {
  const range = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isInteger(range) && range >= 1 && range <= 7 ? range : null
}

/**
 * POST endpoint to import stats from CSV data
 * Body: { csvContent: string, week: number, range: number }
 */
export async function POST(request: NextRequest) {
  try {
    const dbUser = await getAuthenticatedDbUser(request)

    if (!dbUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (!canUploadStats(dbUser.role)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin, Manager, Operations Manager, Team Leader, or Supervisor only' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { csvContent, periodType, week, month, range } = body

    if (!csvContent || typeof csvContent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid csvContent' },
        { status: 400 }
      )
    }

    const selectedPeriodType = periodType === 'monthly' ? 'monthly' : 'weekly'
    const selectedWeek = parseWeek(week)
    const selectedMonth = parseMonth(month)
    const selectedRange = parseRange(range)

    if (selectedPeriodType === 'weekly' && selectedWeek === null) {
      return NextResponse.json({ error: 'Week must be a positive integer' }, { status: 400 })
    }

    if (selectedPeriodType === 'monthly' && selectedMonth === null) {
      return NextResponse.json({ error: 'Month must be between 1 and 12' }, { status: 400 })
    }

    if (selectedPeriodType === 'weekly' && selectedRange === null) {
      return NextResponse.json({ error: 'Range must be an integer from 1 to 7' }, { status: 400 })
    }

    // Parse CSV
    const lines = csvContent.trim().split('\n')
    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have headers and at least one data row' },
        { status: 400 }
      )
    }

    const headers = lines[0].split(',').map(h => h.trim())
    const records: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())

      // Skip empty rows
      if (values.every(v => !v)) continue

      const record: any = {}
      headers.forEach((header, index) => {
        record[header] = values[index] || null
      })

      records.push(record)
    }

    const recordsWithNames = records
      .map((record, index) => ({ record, rowNumber: index + 2 }))
      .filter(({ record }) => record.Name)

    if (recordsWithNames.length === 0) {
      return NextResponse.json(
        { error: 'CSV must include a Name column with at least one agent name' },
        { status: 400 }
      )
    }

    // The roster is an optional source of current team-leader data, not an
    // allowlist. Agents who have left the roster remain valid historical rows.
    const { data: rosterData, error: rosterError } = await supabaseAdmin
      .from('agents')
      .select('name, team_leader')

    if (rosterError) {
      return NextResponse.json(
        { error: `Failed to read the agent roster: ${rosterError.message}` },
        { status: 500 }
      )
    }

    const roster = ((rosterData || []) as StatsRosterEntry[])
      .map(agent => ({
        name: agent.name?.trim(),
        team_leader: agent.team_leader,
      }))
      .filter((agent): agent is StatsRosterEntry => Boolean(agent.name))

    const resolvedRecords: Array<{
      record: any
      rowNumber: number
      resolution: ReturnType<typeof resolveStatsTeamLeader>
    }> = []
    const resolutionBatchSize = 10

    for (let index = 0; index < recordsWithNames.length; index += resolutionBatchSize) {
      const batch = recordsWithNames.slice(index, index + resolutionBatchSize)
      const resolvedBatch = await Promise.all(batch.map(async ({ record, rowNumber }) => {
        const rosterResolution = resolveStatsRosterEntry(record.Name.trim(), roster)
        const historicalIdentity = rosterResolution.status === 'matched'
          ? null
          : await getHistoricalStatsTeamLeader([record.Name])

        return {
          record,
          rowNumber,
          resolution: resolveStatsTeamLeader({
            csvName: record.Name.trim(),
            csvTeamLeader: record.Supervisor,
            roster,
            historicalTeamLeader: historicalIdentity?.teamLeader,
          }),
        }
      }))
      resolvedRecords.push(...resolvedBatch)
    }

    const validationErrors = resolvedRecords.flatMap(({ record, rowNumber, resolution }) =>
      resolution.status === 'matched'
        ? []
        : [`Row ${rowNumber}: "${record.Name}" has no Team Leader in the roster, historical Stats data, or CSV Supervisor column`]
    )

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: `Team Leader resolution failed for ${validationErrors.length} row${validationErrors.length === 1 ? '' : 's'}. No Stats data was changed.`,
          errors: validationErrors,
        },
        { status: 422 }
      )
    }

    // Convert only after every row has a team leader from the roster, historical
    // Stats data, or the uploaded CSV (in that priority order).
    const dbRecords = resolvedRecords.map(({ record: r, resolution }) => {
      if (resolution.status !== 'matched') {
        throw new Error('Unexpected unresolved roster entry after validation')
      }

      const csatScore = getStatsCsvValue(r, 'CSAT_Score', 'CSAT')
      const npsScore = getStatsCsvValue(r, 'NPS_Score', 'NPS')

      return {
        supervisor: resolution.teamLeader,
        name: r.Name,
        acw: r.ACW || null,
        aht: r.AHT || null,
        hold: r.Hold || null,
        talk_time: r['Talk Time'] || null,
        csat_score: csatScore,
        dsat: r.DSAT || null,
        nps_score: npsScore ? parseFloat(npsScore) : null,
        promoter: r['Promoter (*)'] ? parseInt(r['Promoter (*)']) : null,
        mod: r.MOD || null,
        mod_value: r['MOD (*)'] ? parseInt(r['MOD (*)']) : null,
        fcr: r.FCR || null,
        fcr_value: r['FCR (*)'] ? parseInt(r['FCR (*)']) : null,
        surveys_answered: r['Surveys Answered'] ? parseInt(r['Surveys Answered']) : null,
        calls_touched: r['Calls Touched'] ? parseInt(r['Calls Touched']) : null,
        tickets_solved: r['Tickets Solved'] ? parseInt(r['Tickets Solved']) : null,
        transactions: r.Transactions ? parseInt(r.Transactions) : null,
        productive_hours: r['Productive Hours'] || null,
        tph: r.TPH ? parseFloat(r.TPH) : null,
        ...(selectedPeriodType === 'monthly'
          ? { month: String(selectedMonth) }
          : {
              week: selectedWeek ?? 1,
              range: selectedRange ?? 1,
            }),
      }
    })

    // Capture existing rows so a failed import can restore the previous week data.
    const tableName = selectedPeriodType === 'monthly' ? 'stats_month' : 'stats'

    const { data: existingRows, error: fetchExistingError } = await supabaseAdmin
      .from(tableName)
      .select(selectedPeriodType === 'monthly' ? STATS_MONTH_COLUMNS : STATS_COLUMNS)
      .eq(selectedPeriodType === 'monthly' ? 'month' : 'week', selectedPeriodType === 'monthly' ? String(selectedMonth) : selectedWeek)

    if (fetchExistingError) {
      return NextResponse.json(
        { error: `Failed to read existing stats for week ${selectedWeek}: ${fetchExistingError.message}` },
        { status: 500 }
      )
    }

    // Overwrite all stats for the selected week before inserting the new range.
    const { error: deleteError } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq(selectedPeriodType === 'monthly' ? 'month' : 'week', selectedPeriodType === 'monthly' ? String(selectedMonth) : selectedWeek)

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to clear existing stats for week ${selectedWeek}: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // Insert records in batches
    let successCount = 0
    let failureCount = 0
    const errors: string[] = []
    let restoreAttempted = false

    const batchSize = 100
    for (let i = 0; i < dbRecords.length; i += batchSize) {
      const batch = dbRecords.slice(i, i + batchSize)
      const { error } = await supabaseAdmin.from(tableName).insert(batch)

      if (error) {
        failureCount += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`)

        if (!restoreAttempted && existingRows && existingRows.length > 0) {
          const { error: deletePartialError } = await supabaseAdmin
            .from(tableName)
            .delete()
            .eq(selectedPeriodType === 'monthly' ? 'month' : 'week', selectedPeriodType === 'monthly' ? String(selectedMonth) : selectedWeek)

          if (deletePartialError) {
            errors.push(`Failed to clear partial import: ${deletePartialError.message}`)
          } else {
            const { error: restoreError } = await supabaseAdmin.from(tableName).insert(existingRows)
            if (restoreError) {
              errors.push(`Failed to restore previous stats: ${restoreError.message}`)
            }
          }

          restoreAttempted = true
        }

        break
      } else {
        successCount += batch.length
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          imported: successCount,
          failed: failureCount,
          errors,
          message: `Failed to import stats for ${selectedPeriodType === 'monthly' ? `month ${selectedMonth}` : `week ${selectedWeek}`}, range ${selectedRange}`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      imported: successCount,
      failed: failureCount,
      message: `Successfully imported ${successCount} records for ${selectedPeriodType === 'monthly' ? `month ${selectedMonth}` : `week ${selectedWeek}`}, range ${selectedRange}`,
    })
  } catch (error: any) {
    console.error('Stats import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import stats' },
      { status: 500 }
    )
  }
}
