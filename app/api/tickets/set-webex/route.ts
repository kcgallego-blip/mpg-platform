import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request
) {
  try {
    const { searchParams } = new URL(request.url)
    const ticketId = searchParams.get('ticketid')
    const webexMessageId = searchParams.get('webex_message_id')

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketid query parameter is required' },
        { status: 400 }
      )
    }

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
