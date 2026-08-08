import { NextRequest, NextResponse } from 'next/server'
import { PRODUCTIVITY_REPORT_SETTING_KEY } from '@/lib/featureAccess'
import { getProductivityReportEnabled } from '@/lib/featureSettings'
import { getAuthenticatedDbUser } from '@/lib/sessionAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
}

const toResponse = (productivityReportEnabled: boolean) => ({
  productivityReportEnabled,
})

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: noStoreHeaders }
      )
    }

    return NextResponse.json(toResponse(await getProductivityReportEnabled()), {
      headers: noStoreHeaders,
    })
  } catch (error) {
    console.error('Error loading Productivity report setting:', error)
    return NextResponse.json(
      { error: 'Unable to load feature settings' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedDbUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401, headers: noStoreHeaders }
      )
    }

    if (user.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Administrator access required' },
        { status: 403, headers: noStoreHeaders }
      )
    }

    const body = await request.json().catch(() => null)

    if (!body || typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled must be a boolean' },
        { status: 400, headers: noStoreHeaders }
      )
    }

    const { error } = await supabaseAdmin.from('feature_settings').upsert(
      {
        key: PRODUCTIVITY_REPORT_SETTING_KEY,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
        updated_by: user.email,
      },
      { onConflict: 'key' }
    )

    if (error) {
      throw error
    }

    return NextResponse.json(toResponse(body.enabled), {
      headers: noStoreHeaders,
    })
  } catch (error) {
    console.error('Error updating Productivity report setting:', error)
    return NextResponse.json(
      { error: 'Unable to update feature settings' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}
