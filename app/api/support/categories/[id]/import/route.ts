import { NextRequest, NextResponse } from 'next/server'
import { normalizeCellFormats, normalizeRowData, type SupportCellFormat } from '@/lib/support'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeSupport, getSupportCategoryColumns, SUPPORT_NO_STORE_HEADERS, supportErrorResponse, UUID_PATTERN } from '@/lib/supportServer'

const MAX_IMPORT_ROWS = 5000
type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid category ID' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  try {
    const columns = await getSupportCategoryColumns(id)
    if (!columns) return NextResponse.json({ error: 'Category not found' }, { status: 404, headers: SUPPORT_NO_STORE_HEADERS })
    const body = await request.json().catch(() => null) as { rows?: unknown } | null
    if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ error: 'At least one mapped CSV row is required' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
    if (body.rows.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `Import is limited to ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time` }, { status: 413, headers: SUPPORT_NO_STORE_HEADERS })
    const rows: Array<{ data: Record<string, string>; cellFormats: Record<string, SupportCellFormat> }> = []
    for (let index = 0; index < body.rows.length; index += 1) {
      const source = body.rows[index]
      const wrapped = source && typeof source === 'object' && !Array.isArray(source) && 'data' in source
        ? source as { data?: unknown; cellFormats?: unknown }
        : { data: source, cellFormats: undefined }
      const normalized = normalizeRowData(wrapped.data, columns)
      if (normalized.error) return NextResponse.json({ error: `Spreadsheet row ${index + 2}: ${normalized.error}` }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
      const normalizedFormats = normalizeCellFormats(wrapped.cellFormats, columns)
      if (normalizedFormats.error) return NextResponse.json({ error: `Spreadsheet row ${index + 2}: ${normalizedFormats.error}` }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
      rows.push({ data: normalized.value!, cellFormats: normalizedFormats.value! })
    }
    const { data, error } = await supabaseAdmin.rpc('bulk_insert_support_rows', { p_category_id: id, p_rows: rows, p_actor: auth.user.email })
    if (error) throw error
    return NextResponse.json({ imported: Number(data), message: `Imported ${Number(data).toLocaleString()} support rows` }, { status: 201, headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) { return supportErrorResponse(error, 'Unable to import support rows') }
}
