import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type ScheduleAgent = {
  id: string
  name: string
  role: string
  dayOff1: string
  dayOff2: string
  startShift: string
  endShift: string
  break1: string
  lunch: string
  break2: string
  supervisor: string
  present: boolean | null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamLeader = searchParams.get('teamLeader')?.trim()

    let query = supabase
      .from('agents')
      .select('name, team_leader, role, off_1, off_2, start_shift, end_shift, comments, present')
      .order('name', { ascending: true })

    if (teamLeader) {
      query = query.ilike('team_leader', teamLeader)
    }

    const { data, error } = await query

    if (error) throw error

    const agents: ScheduleAgent[] = (data || []).map((agent) => ({
      id: agent.name,
      name: agent.name,
      role: agent.role || '',
      dayOff1: agent.off_1 || '',
      dayOff2: agent.off_2 || '',
      startShift: agent.start_shift || '',
      endShift: agent.end_shift || '',
      break1: '',
      lunch: '',
      break2: '',
      supervisor: agent.team_leader || '',
      present: agent.present ?? true,
    }))

    const supervisors = Array.from(
      new Set(agents.map((agent) => agent.supervisor).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      agents,
      supervisors,
    })
  } catch (error: any) {
    console.error('Error loading schedule from agents table:', error)
    return NextResponse.json(
      { error: error.message || 'Unable to load schedule' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json()
    const agentName = typeof payload?.agentName === 'string' ? payload.agentName.trim() : ''
    const present = typeof payload?.present === 'boolean' ? payload.present : null

    if (!agentName) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('agents')
      .update({ present })
      .eq('name', agentName)

    if (error) throw error

    return NextResponse.json({ success: true, agentName, present })
  } catch (error: any) {
    console.error('Error updating agent presence:', error)
    return NextResponse.json(
      { error: error.message || 'Unable to update agent presence' },
      { status: 500 }
    )
  }
}
