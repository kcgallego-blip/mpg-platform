import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const state = searchParams.get('state')

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
    const email = webexUser.emails?.[0] || webexUser.email
    const name = webexUser.displayName || `${webexUser.firstName || ''} ${webexUser.lastName || ''}`.trim()
    const avatar = webexUser.avatar

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', request.url))
    }

    const now = new Date().toISOString()

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('email, role, access, registered_at')
      .eq('email', email)
      .maybeSingle()

    if (existingUserError) {
      console.error('Database user lookup error:', existingUserError)
      return NextResponse.redirect(new URL('/login?error=db_error', request.url))
    }

    const { error: dbError } = existingUser
      ? await supabase
        .from('users')
        .update({
          name,
          token: accessToken,
          avatar_image: avatar,
          is_active: true,
          last_login: now,
        })
        .eq('email', email)
      : await supabase
        .from('users')
        .insert({
          email,
          name,
          token: accessToken,
          avatar_image: avatar,
          is_active: true,
          registered_at: now,
          last_login: now,
          role: 'Agent',
          access: null,
        })

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

    // Set auth cookie with user data
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.set('webex_auth', JSON.stringify({ 
      email, 
      name, 
      token: accessToken,
      avatar_image: avatar,
      company: null
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return response
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }
}
