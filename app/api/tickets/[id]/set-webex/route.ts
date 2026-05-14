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

    // Get webex_message_id from query params
    const { searchParams } = new URL(request.url)
    const webexMessageId = searchParams.get('webex_message_id')

    if (!webexMessageId) {
      return NextResponse.json(
        { error: 'webex_message_id query parameter is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ webex_message_id: webexMessageId })
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
      { 
        message: 'Webex message ID updated successfully', 
        ticket: data 
      },
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
