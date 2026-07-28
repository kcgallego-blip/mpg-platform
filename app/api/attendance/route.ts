import { NextRequest, NextResponse } from 'next/server'
import { canUserAccessAttendance } from '@/lib/featureSettings'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { getDefaultShiftDate, isDateKey } from '@/lib/attendance'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_AGENT_RANGE_DAYS = 62

const getRangeLength = (from: string, to: string) => {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (!(await canUserAccessAttendance(user.role))) {
      return NextResponse.json({ error: 'Attendance route is disabled' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl

    if (user.role === 'Agent') {
      const from = searchParams.get('from') || ''
      const to = searchParams.get('to') || ''

      if (!isDateKey(from) || !isDateKey(to)) {
        return NextResponse.json(
          { error: 'A valid attendance month range is required' },
          { status: 400 }
        )
      }

      const rangeLength = getRangeLength(from, to)
      if (rangeLength < 1 || rangeLength > MAX_AGENT_RANGE_DAYS) {
        return NextResponse.json(
          { error: 'Attendance date range must be between 1 and 62 days' },
          { status: 400 }
        )
      }

      const { data, error } = await supabase
        .from('attendance')
        .select('agent, shift_date, time_in, time_out')
        .eq('agent', user.email)
        .gte('shift_date', from)
        .lte('shift_date', to)
        .order('shift_date', { ascending: true })

      if (error) throw error

      return NextResponse.json({
        records: data || [],
        scope: 'personal',
      })
    }

    if (!user.role) {
      return NextResponse.json({ error: 'Attendance access denied' }, { status: 403 })
    }

    const shiftDate = searchParams.get('shiftDate') || getDefaultShiftDate()

    if (!isDateKey(shiftDate)) {
      return NextResponse.json({ error: 'A valid shift date is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('attendance')
      .select('agent, shift_date, time_in, time_out')
      .eq('shift_date', shiftDate)
      .order('agent', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      records: data || [],
      scope: 'team',
    })
  } catch (error) {
    console.error('Error loading attendance:', error)
    return NextResponse.json(
      { error: 'Unable to load attendance' },
      { status: 500 }
    )
  }
}
