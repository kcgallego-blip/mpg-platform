import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function PUT(
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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const assistedBy = searchParams.get('it')

    // Build update object
    const updateData: any = { status: 'Pending' }
    if (assistedBy) {
      updateData.assisted_by = assistedBy
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
      { 
        message: 'Ticket status updated to Pending', 
        ticket: data 
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
