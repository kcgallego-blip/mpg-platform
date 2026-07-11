import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, setSessionTokenCookie } from '@/lib/sessionToken'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${error}`, request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=no_code', request.url))
    }

    const clientId = process.env.NEXT_PUBLIC_WEBEX_CLIENT_ID
    const clientSecret = process.env.WEBEX_CLIENT_SECRET
    // Remove trailing slash from base URL to avoid double slashes
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`).replace(/\/$/, '')
    const redirectUri = `${baseUrl}/api/auth/callback`

    if (!clientId || !clientSecret) {
      console.error('Missing Webex environment variables')
      return NextResponse.redirect(new URL('/login?error=config_error', request.url))
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://webexapis.com/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Webex token error:', errorData)
      return NextResponse.redirect(new URL('/login?error=token_error', request.url))
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get user info from Webex
    const userResponse = await fetch('https://webexapis.com/v1/people/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.json()
      console.error('Webex user info error:', errorData)
      return NextResponse.redirect(new URL('/login?error=user_info_error', request.url))
    }

    const webexUser = await userResponse.json()

    // Extract email from Webex response - emails is an array
    const email = (webexUser.emails?.[0] || webexUser.email)?.trim().toLowerCase()
    const name = webexUser.displayName || `${webexUser.firstName || ''} ${webexUser.lastName || ''}`.trim()
    const avatar = webexUser.avatar

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', request.url))
    }

    const now = new Date().toISOString()

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('email, role, access, registered_at, is_active, name, avatar_image')
      .eq('email', email)
      .maybeSingle()

    if (existingUserError) {
      console.error('Database user lookup error:', existingUserError)
      return NextResponse.redirect(new URL('/login?error=db_error', request.url))
    }

    if (!existingUser) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          name,
          avatar_image: avatar,
          is_active: false,
          registered_at: now,
          role: 'Agent',
          access: null,
        })

      if (insertError) {
        console.error('Database auth user save error:', insertError)
        return NextResponse.redirect(new URL('/login?error=db_error', request.url))
      }

      return NextResponse.redirect(new URL('/login?error=approval_required', request.url))
    }

    if (existingUser.is_active !== true) {
      return NextResponse.redirect(new URL('/login?error=approval_required', request.url))
    }

    const sessionToken = createSessionToken()
    const updatePayload: Record<string, string | null> = {
      token: sessionToken,
      last_login: now,
    }

    if (!existingUser.name) {
      updatePayload.name = name
    }

    if (!existingUser.avatar_image) {
      updatePayload.avatar_image = avatar
    }

    const { error: dbError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('email', email)

    if (dbError) {
      console.error('Database auth user save error:', dbError)
      return NextResponse.redirect(new URL('/login?error=db_error', request.url))
    }

    // Create Supabase session (or skip if already exists)
    try {
      await supabase.auth.admin.createUser({
        email: email,
        user_metadata: {
          name: name,
          avatar_url: avatar,
        },
      })
    } catch (sessionError: any) {
      // User might already exist, continue anyway
      console.log('User creation note:', sessionError.message)
    }

    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    setSessionTokenCookie(response, sessionToken)

    return response
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }
}
