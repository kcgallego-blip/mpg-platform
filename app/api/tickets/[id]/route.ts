import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

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
      .select('*')
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

export async function PATCH(
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

    const body = await request.json()
    const { end_time, troubleshooting } = body

    const updateData: any = {}
    if (end_time !== undefined) updateData.end_time = end_time
    if (troubleshooting !== undefined) updateData.troubleshooting = troubleshooting

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update (end_time or troubleshooting)' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('ticketid', parseInt(ticketId))
      .select()
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

    return NextResponse.json(
      { message: 'Ticket updated successfully', ticket: data },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error updating ticket:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
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

    const body = await request.json()
    const { webex_message_id } = body

    if (!webex_message_id) {
      return NextResponse.json(
        { error: 'webex_message_id is required' },
        { status: 400 }
      )
    }

    // Update the ticket with the webex_message_id
    const { data, error } = await supabase
      .from('tickets')
      .update({ webex_message_id })
      .eq('ticketid', parseInt(ticketId))
      .select()
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

    return NextResponse.json(
      { message: 'Ticket updated with webex_message_id successfully', ticket: data },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error updating ticket with webex_message_id:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

