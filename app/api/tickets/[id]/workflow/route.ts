import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabase } from '@/lib/supabase'
import { normalizeDatabaseTime } from '@/lib/ticketTime'

type WorkflowBody = {
  action?: unknown
  assistedBy?: unknown
  troubleshooting?: unknown
  note?: unknown
  reported?: unknown
  endTime?: unknown
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function canManageTickets(role: string | null): boolean {
  return Boolean(role?.trim()) && role?.trim().toLowerCase() !== 'agent'
}

function getPhilippineTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: 'Ticket management access denied' }, { status: 403 })
    }

    const { id } = await params
    const ticketId = Number(id)
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ error: 'A valid ticket ID is required' }, { status: 400 })
    }

    const body = await request.json() as WorkflowBody
    const action = asTrimmedString(body.action)
    if (!action || !['pending', 'solve', 'add_note', 'save_troubleshooting', 'set_reported'].includes(action)) {
      return NextResponse.json({ error: 'A valid workflow action is required' }, { status: 400 })
    }

    const now = new Date()
    const actor = user.name?.trim() || user.email
    if (action === 'set_reported' && typeof body.reported !== 'boolean') {
      return NextResponse.json({ error: 'Reported must be true or false' }, { status: 400 })
    }

    const endTime = action === 'solve'
      ? normalizeDatabaseTime(body.endTime)
      : getPhilippineTime(now)
    if (action === 'solve' && !endTime) {
      return NextResponse.json({ error: 'A valid completion time is required' }, { status: 400 })
    }

    const { data, error } = action === 'set_reported'
      ? await supabase.rpc('set_ticket_reported', {
          p_ticket_id: ticketId,
          p_actor: actor,
          p_reported: body.reported as boolean,
          p_event_timestamp: now.toISOString(),
        })
      : await supabase.rpc('update_ticket_workflow', {
          p_ticket_id: ticketId,
          p_action: action,
          p_actor: actor,
          p_assisted_by: asTrimmedString(body.assistedBy),
          p_troubleshooting: asTrimmedString(body.troubleshooting),
          p_note: asTrimmedString(body.note),
          p_event_timestamp: now.toISOString(),
          p_end_time: endTime,
        })

    if (error) {
      const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 500
      return NextResponse.json(
        { error: error.message || 'Unable to update the ticket' },
        { status }
      )
    }

    const ticket = Array.isArray(data) ? data[0] : data
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    return NextResponse.json({ ticket })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update the ticket'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: 'Ticket management access denied' }, { status: 403 })
    }

    const { id } = await params
    const ticketId = Number(id)
    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json({ error: 'A valid ticket ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('delete_open_ticket', {
      p_ticket_id: ticketId,
    })

    if (error) {
      const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 400 : 500
      return NextResponse.json(
        { error: error.message || 'Unable to delete the ticket' },
        { status }
      )
    }

    return NextResponse.json({ ticketId: Number(data) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to delete the ticket'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
