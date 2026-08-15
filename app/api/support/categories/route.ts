import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateCategoryInput } from '@/lib/support'
import { authorizeSupport, getSupportOrderConflict, SUPPORT_NO_STORE_HEADERS, supportErrorResponse } from '@/lib/supportServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  try {
    const { data, error } = await supabaseAdmin.from('support_categories').select('id, name, columns, is_quick_access, quick_access_order, sort_order, created_at, updated_at').order('sort_order').order('name')
    if (error) throw error
    return NextResponse.json({ categories: data || [] }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to load support categories') }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const validation = validateCategoryInput(await request.json().catch(() => null))
  if (!validation.value) return NextResponse.json({ error: validation.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  const input = validation.value
  try {
    const orderConflict = await getSupportOrderConflict(input)
    if (orderConflict) return NextResponse.json({ error: orderConflict }, { status: 409, headers: SUPPORT_NO_STORE_HEADERS })
    const { data, error } = await supabaseAdmin.from('support_categories').insert({
      name: input.name, columns: input.columns, is_quick_access: input.isQuickAccess,
      quick_access_order: input.quickAccessOrder, sort_order: input.sortOrder,
      created_by: auth.user.email, updated_by: auth.user.email,
    }).select('id').single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201, headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to create support category') }
}
