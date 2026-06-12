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

    // Get user's role from database
    const { data: dbUser, error: roleError } = await supabase
      .from('users')
      .select('role, name')
      .eq('email', userData.email)
      .single()

    if (roleError || !dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = dbUser.role || 'Agent'
    const userName = dbUser.name || userData.name

    // Get query parameters for filtering and searching
    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('search')?.toLowerCase() || ''
    const supervisorFilter = searchParams.get('supervisor')
    const sortBy = searchParams.get('sortBy') || 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

    let query = supabase.from('stats').select('*')

    // Role-based filtering
    if (userRole.toLowerCase() === 'agent') {
      // Agents can only see their own stats
      query = query.eq('name', userName)
    } else if (userRole.toLowerCase() === 'team leader' || userRole.toLowerCase() === 'supervisor') {
      // Team leaders can see stats of agents under them
      query = query.eq('supervisor', dbUser.name || userData.name)
    }
    // Admin/Manager roles can see all stats (no additional filter)

    // Apply search filter
    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`)
    }

    // Apply supervisor filter
    if (supervisorFilter && supervisorFilter !== 'all') {
      query = query.eq('supervisor', supervisorFilter)
    }

    // Apply sorting
    const validSortFields = [
      'name',
      'supervisor',
      'acw',
      'aht',
      'hold',
      'talk_time',
      'csat_score',
      'nps_score',
      'mod',
      'fcr',
      'tph',
      'created_at',
    ]
    const safeSortBy = validSortFields.includes(sortBy) ? sortBy : 'name'
    const safeOrder = sortOrder.toLowerCase() === 'desc' ? false : true

    query = query.order(safeSortBy, { ascending: safeOrder }).order('created_at', { ascending: false })

    const { data: stats, error: statsError } = await query

    if (statsError) {
      console.error('Stats fetch error:', statsError)
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    // If team leader/supervisor, also return list of unique supervisors for filtering
    let supervisors: string[] = []
    if (userRole.toLowerCase() !== 'agent') {
      const { data: supervisorData } = await supabase
        .from('stats')
        .select('supervisor')
        .distinct()
        .order('supervisor', { ascending: true })

      supervisors = supervisorData?.map(s => s.supervisor).filter(s => s) || []
    }

    return NextResponse.json({
      stats: stats || [],
      supervisors,
      userRole,
      userName,
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
