import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

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
    const { webex_message_id } = body

    if (!webex_message_id) {
      return NextResponse.json(
        { error: 'webex_message_id is required in request body' },
        { status: 400 }
      )
    }

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
      { message: 'Webex message ID updated', ticket: data },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Error updating webex_message_id:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
