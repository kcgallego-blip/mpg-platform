import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const authCookie = request.cookies.get('webex_auth')

    if (!authCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let userData
    try {
      userData = JSON.parse(authCookie.value)
    } catch {
      return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
    }
    
    // Fetch user role from database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('role')
      .eq('email', userData.email)
      .single()

    if (!dbError && dbUser) {
      userData.role = dbUser.role || null
    }
    
    return NextResponse.json(userData)
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ error: 'Invalid auth data' }, { status: 401 })
  }
}
