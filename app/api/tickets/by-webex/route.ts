import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request
) {
  try {
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
      .select('*')
      .eq('webex_message_id', webexMessageId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Ticket not found for given webex_message_id' },
          { status: 404 }
        )
      }
      throw error
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching ticket by webex_message_id:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
