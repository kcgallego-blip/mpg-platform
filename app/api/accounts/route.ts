import { NextRequest, NextResponse } from 'next/server'
import { canViewAccounts } from '@/lib/accountAccess'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedDbUser(request)

  if (!actor) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!canViewAccounts(actor.role)) {
    return NextResponse.json({ error: 'Admin or IT access required' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email, name, role, registered_at, access, avatar_image, is_active, last_login, password_hash')
    .order('registered_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (data ?? []).map(({ password_hash, ...user }) => ({
    ...user,
    hasLocalPassword: Boolean(password_hash),
  }))

  return NextResponse.json({ users }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

