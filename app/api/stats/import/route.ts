import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST endpoint to import stats from CSV data
 * Body: { csvContent: string }
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
      .select('role')
      .eq('email', userData.email)
      .single()

    if (roleError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = dbUser.role?.toLowerCase()
    if (userRole !== 'admin' && userRole !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { csvContent } = body

    if (!csvContent || typeof csvContent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid csvContent' },
        { status: 400 }
      )
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
      .filter(r => r.Supervisor && r.Name) // Only keep records with supervisor and name
      .map(r => ({
        supervisor: r.Supervisor,
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
      }))

    if (dbRecords.length === 0) {
      return NextResponse.json(
        { error: 'No valid records found in CSV' },
        { status: 400 }
      )
    }

    // Insert records in batches
    let successCount = 0
    let failureCount = 0
    const errors: string[] = []

    const batchSize = 100
    for (let i = 0; i < dbRecords.length; i += batchSize) {
      const batch = dbRecords.slice(i, i + batchSize)
      const { error, data } = await supabase.from('stats').insert(batch).select()

      if (error) {
        failureCount += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`)
      } else {
        successCount += batch.length
      }
    }

    return NextResponse.json({
      success: true,
      imported: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${successCount} records${failureCount > 0 ? ` (${failureCount} failed)` : ''}`,
    })
  } catch (error: any) {
    console.error('Stats import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import stats' },
      { status: 500 }
    )
  }
}
