import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const role = user.role?.trim().toLowerCase() || ''
    const teamLeader = ['team leader', 'supervisor'].includes(role) ? user.name?.trim() : null
    let query = supabaseAdmin
      .from('agents')
      .select('name, team_leader, role, off_1, off_2, start_shift, end_shift, present')
      .order('name', { ascending: true })

    if (teamLeader) query = query.ilike('team_leader', teamLeader)
    const { data, error } = await query

    if (error) throw error

    const allAgents = (data || []) as Array<{
      name: string
      team_leader: string | null
      role: string | null
      off_1: string | null
      off_2: string | null
      start_shift: string | null
      end_shift: string | null
      present: boolean | null
    }>

    const agents: ScheduleAgent[] = allAgents.map((agent) => ({
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

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!user.role?.trim() || user.role.trim().toLowerCase() === 'agent') {
      return NextResponse.json({ error: 'Staffing update access denied' }, { status: 403 })
    }

    const payload = await request.json()
    const agentName = typeof payload?.agentName === 'string' ? payload.agentName.trim() : ''
    const present = typeof payload?.present === 'boolean' ? payload.present : null

    if (!agentName) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
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
