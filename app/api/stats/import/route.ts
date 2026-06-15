import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const parseWeek = (value: unknown) => {
  const week = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isInteger(week) && week > 0 ? week : null
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
    // Check authentication
    const authCookie = request.cookies.get('webex_auth')

    if (!authCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let userData
    try {
      userData = JSON.parse(authCookie.value)
    } catch {
      return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
    }

    // Verify user is admin (basic check - could be enhanced with proper role system)
    const { data: dbUser, error: roleError } = await supabase
      .from('users')
      .select('role, name')
      .eq('email', userData.email)
      .single()

    if (roleError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = dbUser.role?.toLowerCase()
    if (!['admin', 'manager', 'team leader', 'supervisor'].includes(userRole || '')) {
      return NextResponse.json({ error: 'Unauthorized - Admin, Manager, Team Leader, or Supervisor only' }, { status: 403 })
    }

    const defaultSupervisor = dbUser.name || userData.name

    // Parse request body
    const body = await request.json()
    const { csvContent, week, range } = body

    if (!csvContent || typeof csvContent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid csvContent' },
        { status: 400 }
      )
    }

    const selectedWeek = parseWeek(week)
    const selectedRange = parseRange(range)

    if (selectedWeek === null) {
      return NextResponse.json({ error: 'Week must be a positive integer' }, { status: 400 })
    }

    if (selectedRange === null) {
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

    // Convert to database format
    const dbRecords = records
      .filter(r => r.Name)
      .map(r => ({
        supervisor: r.Supervisor || defaultSupervisor,
        name: r.Name,
        acw: r.ACW || null,
        aht: r.AHT || null,
        hold: r.Hold || null,
        talk_time: r['Talk Time'] || null,
        csat_score: r.CSAT_Score || null,
        dsat: r.DSAT || null,
        nps_score: r.NPS_Score ? parseFloat(r.NPS_Score) : null,
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
        week: selectedWeek,
        range: selectedRange,
      }))

    if (dbRecords.length === 0) {
      return NextResponse.json(
        { error: 'CSV must include a Name column with at least one agent name' },
        { status: 400 }
      )
    }

    // Capture existing rows so a failed import can restore the previous week data.
    const { data: existingRows, error: fetchExistingError } = await supabase
      .from('stats')
      .select('*')
      .eq('week', selectedWeek)

    if (fetchExistingError) {
      return NextResponse.json(
        { error: `Failed to read existing stats for week ${selectedWeek}: ${fetchExistingError.message}` },
        { status: 500 }
      )
    }

    // Overwrite all stats for the selected week before inserting the new range.
    const { error: deleteError } = await supabase
      .from('stats')
      .delete()
      .eq('week', selectedWeek)

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
      const { error } = await supabase.from('stats').insert(batch)

      if (error) {
        failureCount += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`)

        if (!restoreAttempted && existingRows && existingRows.length > 0) {
          const { error: deletePartialError } = await supabase
            .from('stats')
            .delete()
            .eq('week', selectedWeek)

          if (deletePartialError) {
            errors.push(`Failed to clear partial import: ${deletePartialError.message}`)
          } else {
            const { error: restoreError } = await supabase.from('stats').insert(existingRows)
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
          message: `Failed to import stats for week ${selectedWeek}, range ${selectedRange}`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      imported: successCount,
      failed: failureCount,
      message: `Successfully imported ${successCount} records for week ${selectedWeek}, range ${selectedRange}`,
    })
  } catch (error: any) {
    console.error('Stats import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import stats' },
      { status: 500 }
    )
  }
}
