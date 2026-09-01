import { NextRequest, NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/authCookie'
import { clearSessionTokenCookie, getSessionTokenCookie } from '@/lib/sessionToken'
import { supabase } from '@/lib/supabase'
import { clearPasswordChangeCookie } from '@/lib/passwordChangeCookie'

export async function POST(request: NextRequest) {
  const sessionToken = getSessionTokenCookie(request)

  if (sessionToken) {
    await supabase
      .from('users')
      .update({ token: null })
      .eq('token', sessionToken)
  }

  const response = NextResponse.json({ success: true })

  clearAuthCookie(response)
  clearSessionTokenCookie(response)
  clearPasswordChangeCookie(response)

  return response
}
