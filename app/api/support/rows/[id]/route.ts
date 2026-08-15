import { NextRequest, NextResponse } from 'next/server'
import { normalizeCellFormats, normalizeRowData } from '@/lib/support'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeSupport, getSupportCategoryColumns, SUPPORT_NO_STORE_HEADERS, supportErrorResponse, UUID_PATTERN } from '@/lib/supportServer'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid row ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  try {
    const { data: existing, error: findError } = await supabaseAdmin.from('support_rows').select('category_id').eq('id', id).maybeSingle()
    if (findError) throw findError
    if (!existing) return NextResponse.json({ error: 'Row not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    const columns = await getSupportCategoryColumns(existing.category_id)
    if (!columns) return NextResponse.json({ error: 'Category not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    const body = await request.json().catch(() => null) as { data?: unknown; cellFormats?: unknown } | null
    const normalized = normalizeRowData(body?.data, columns)
    if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
    const normalizedFormats = normalizeCellFormats(body?.cellFormats, columns)
    if (normalizedFormats.error) return NextResponse.json({ error: normalizedFormats.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
    const { data, error } = await supabaseAdmin.from('support_rows').update({ data: normalized.value, cell_formats: normalizedFormats.value, updated_by: auth.user.email }).eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Row not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    return NextResponse.json({ id: data.id }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to update support row') }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid row ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  try {
    const { data, error } = await supabaseAdmin.from('support_rows').delete().eq('id', id).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Row not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    return NextResponse.json({ deleted: true }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to delete support row') }
}
