import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeSupport, SUPPORT_NO_STORE_HEADERS, supportErrorResponse } from '@/lib/supportServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeSupport(request)
  if (auth.response) return auth.response
  try {
    const { data, error } = await supabaseAdmin.from('support_revision').select('version, updated_at').eq('id', true).single()
    if (error) throw error
    return NextResponse.json({ version: Number(data.version), latestUpdateTimestamp: data.updated_at }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to check support updates') }
}
