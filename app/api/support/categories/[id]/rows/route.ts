import { NextRequest, NextResponse } from 'next/server'
import { normalizeCellFormats, normalizeRowData } from '@/lib/support'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeSupport, getSupportCategoryColumns, SUPPORT_NO_STORE_HEADERS, supportErrorResponse, UUID_PATTERN } from '@/lib/supportServer'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid category ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  try {
    const columns = await getSupportCategoryColumns(id)
    if (!columns) return NextResponse.json({ error: 'Category not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    const body = await request.json().catch(() => null) as { data?: unknown; cellFormats?: unknown } | null
    const normalized = normalizeRowData(body?.data, columns)
    if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
    const normalizedFormats = normalizeCellFormats(body?.cellFormats, columns)
    if (normalizedFormats.error) return NextResponse.json({ error: normalizedFormats.error }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
    const { data, error } = await supabaseAdmin.from('support_rows').insert({ category_id: id, data: normalized.value, cell_formats: normalizedFormats.value, created_by: auth.user.email, updated_by: auth.user.email }).select('id').single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201, headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to create support row') }
}
