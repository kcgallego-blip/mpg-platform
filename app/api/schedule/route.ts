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

const normalizeName = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const teamLeader = searchParams.get('teamLeader')?.trim()

    const { data, error } = await supabase
      .from('agents')
      .select('name, team_leader, role, off_1, off_2, start_shift, end_shift, comments, present')
      .order('name', { ascending: true })

    if (error) throw error

    const allAgents = (data || []) as Array<{
      name: string
      team_leader: string | null
      role: string | null
      off_1: string | null
      off_2: string | null
      start_shift: string | null
      end_shift: string | null
      comments: string | null
      present: boolean | null
    }>

    const filteredAgents = teamLeader
      ? allAgents.filter((agent) => normalizeName(agent.team_leader) === normalizeName(teamLeader))
      : allAgents

    const agents: ScheduleAgent[] = (filteredAgents.length > 0 ? filteredAgents : allAgents).map((agent) => ({
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
