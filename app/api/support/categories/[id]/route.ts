import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateCategoryInput } from '@/lib/support'
import { authorizeSupport, getSupportOrderConflict, SUPPORT_NO_STORE_HEADERS, supportErrorResponse, UUID_PATTERN } from '@/lib/supportServer'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid category ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  const validation = validateCategoryInput(await request.json().catch(() => null))
  if (!validation.value) return NextResponse.json({ error: validation.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  const input = validation.value
  try {
    const orderConflict = await getSupportOrderConflict(input, id)
    if (orderConflict) return NextResponse.json({ error: orderConflict }, { status: 409, headers: SUPPORT_NO_STORE_HEADERS })
    const { data, error } = await supabaseAdmin.from('support_categories').update({
      name: input.name, columns: input.columns, is_quick_access: input.isQuickAccess,
      quick_access_order: input.quickAccessOrder, sort_order: input.sortOrder, updated_by: auth.user.email,
    }).eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Category not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    return NextResponse.json({ id: data.id }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to update support category') }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid category ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  try {
    const { data, error } = await supabaseAdmin.from('support_categories').delete().eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Category not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    return NextResponse.json({ deleted: true }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to delete support category') }
}
