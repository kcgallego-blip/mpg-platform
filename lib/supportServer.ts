import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedDbUser, type AuthenticatedDbUser } from './sessionAuth'
import { canManageSupport, type CategoryInput, type SupportColumn } from './support'
import { supabaseAdmin } from './supabaseAdmin'

export const SUPPORT_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function authorizeSupport(
  request: NextRequest,
  managerOnly = false
): Promise<{ user: AuthenticatedDbUser; response?: never } | { user?: never; response: NextResponse }> {
  const user = await getAuthenticatedDbUser(request)
  if (!user?.is_active) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: SUPPORT_NO_STORE_HEADERS }) }
  }
  if (!user.role?.trim()) {
    return { response: NextResponse.json({ error: 'An assigned role is required' }, { status: 403, headers: SUPPORT_NO_STORE_HEADERS }) }
  }
  if (managerOnly && !canManageSupport(user.role)) {
    return { response: NextResponse.json({ error: 'Support management access denied' }, { status: 403, headers: SUPPORT_NO_STORE_HEADERS }) }
  }
  return { user }
}

export async function getSupportCategoryColumns(categoryId: string): Promise<SupportColumn[] | null> {
  const { data, error } = await supabaseAdmin
    .from('support_categories')
    .select('columns')
    .eq('id', categoryId)
    .maybeSingle()
  if (error) throw error
  return data ? data.columns as SupportColumn[] : null
}

export async function getSupportOrderConflict(
  input: Required<CategoryInput>,
  excludeCategoryId?: string
): Promise<string | null> {
  let categoryOrderQuery = supabaseAdmin
    .from('support_categories')
    .select('id, name')
    .eq('sort_order', input.sortOrder)
    .limit(1)
  if (excludeCategoryId) categoryOrderQuery = categoryOrderQuery.neq('id', excludeCategoryId)

  let quickOrderQuery = supabaseAdmin
    .from('support_categories')
    .select('id, name')
    .eq('quick_access_order', input.quickAccessOrder)
    .limit(1)
  if (excludeCategoryId) quickOrderQuery = quickOrderQuery.neq('id', excludeCategoryId)

  const [categoryOrderResult, quickOrderResult] = await Promise.all([
    categoryOrderQuery.maybeSingle(),
    quickOrderQuery.maybeSingle(),
  ])
  if (categoryOrderResult.error) throw categoryOrderResult.error
  if (quickOrderResult.error) throw quickOrderResult.error
  if (categoryOrderResult.data) {
    return `Category order ${input.sortOrder} is already used by “${categoryOrderResult.data.name}”. Choose another order.`
  }
  if (quickOrderResult.data) {
    return `Quick tag order ${input.quickAccessOrder} is already used by “${quickOrderResult.data.name}”. Choose another order.`
  }
  return null
}

export function supportErrorResponse(error: unknown, fallback: string) {
  const databaseError = error as { code?: string; message?: string }
  if (databaseError?.code === '23505') {
    if (databaseError.message?.includes('support_categories_sort_order_unique_idx')) {
      return NextResponse.json({ error: 'That category order is already used. Choose another order.' }, { status: 409, headers: SUPPORT_NO_STORE_HEADERS })
    }
    if (databaseError.message?.includes('support_categories_quick_order_unique_idx')) {
      return NextResponse.json({ error: 'That quick tag order is already used. Choose another order.' }, { status: 409, headers: SUPPORT_NO_STORE_HEADERS })
    }
    return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409, headers: SUPPORT_NO_STORE_HEADERS })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500, headers: SUPPORT_NO_STORE_HEADERS })
}
