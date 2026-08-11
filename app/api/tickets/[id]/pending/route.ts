import { supabase } from '@/lib/supabase'
import { TICKET_DETAIL_COLUMNS } from '@/lib/dbColumns'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedDbUser(request)
    if (!user?.is_active) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!user.role?.trim() || user.role.trim().toLowerCase() === 'agent') {
      return NextResponse.json({ error: 'Ticket management access denied' }, { status: 403 })
    }

    const resolvedParams = await params
    const ticketId = Number(resolvedParams.id)

    if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
      return NextResponse.json(
        { error: 'A valid ticket ID is required' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const assistedBy = searchParams.get('it')?.trim()
    if (!assistedBy) {
      return NextResponse.json(
        { error: 'Assisted By is required before moving a ticket to Pending' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .rpc('update_ticket_workflow', {
        p_ticket_id: ticketId,
        p_action: 'pending',
        p_actor: user.name?.trim() || user.email,
        p_assisted_by: assistedBy,
        p_event_timestamp: new Date().toISOString(),
      })

    if (error) {
      if (error.code === 'P0002') {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        )
      }
      const status = error.code === '22023' ? 400 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    const ticket = Array.isArray(data) ? data[0] : data

    return NextResponse.json(
      { 
        message: 'Ticket status updated to Pending', 
        ticket,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error updating ticket status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { error: 'Ticket ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_DETAIL_COLUMNS)
      .eq('ticketid', parseInt(ticketId))
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching ticket:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
