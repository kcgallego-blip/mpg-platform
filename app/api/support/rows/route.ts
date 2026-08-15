import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeSupport, SUPPORT_NO_STORE_HEADERS, supportErrorResponse, UUID_PATTERN } from '@/lib/supportServer'

const MAX_DELETE_ROWS = 5000

export async function DELETE(request: NextRequest) {
  const auth = await authorizeSupport(request, true)
  if (auth.response) return auth.response

  const body = await request.json().catch(() => null) as { rowIds?: unknown } | null
  if (!Array.isArray(body?.rowIds) || body.rowIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one row to delete' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  }
  if (body.rowIds.length > MAX_DELETE_ROWS) {
    return NextResponse.json({ error: `You can delete up to ${MAX_DELETE_ROWS.toLocaleString()} rows at once` }, { status: 413, headers: SUPPORT_NO_STORE_HEADERS })
  }

  const rowIds = Array.from(new Set(body.rowIds))
  if (rowIds.some(rowId => typeof rowId !== 'string' || !UUID_PATTERN.test(rowId))) {
    return NextResponse.json({ error: 'One or more selected row IDs are invalid' }, { status: 400, headers: SUPPORT_NO_STORE_HEADERS })
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('bulk_delete_support_rows', { p_row_ids: rowIds })
    if (error) throw error
    return NextResponse.json({ deleted: Number(data) }, { headers: SUPPORT_NO_STORE_HEADERS })
  } catch (error) {
    return supportErrorResponse(error, 'Unable to delete selected support rows')
  }
}
