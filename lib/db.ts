import { supabase } from './supabase'
import type { Database } from './supabase'

// ============================================================================
// REPORTS FUNCTIONS
// ============================================================================

export async function getUserReports(userId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getReport(reportId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error) throw error
  return data
}

export async function createReport(
  userId: string,
  title: string,
  reportData: any,
  reportType: string = 'performance'
) {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: userId,
      title,
      report_data: reportData,
      report_type: reportType,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateReport(
  reportId: string,
  updates: Partial<Database['public']['Tables']['reports']['Update']>
) {
  const { data, error } = await supabase
    .from('reports')
    .update(updates)
    .eq('id', reportId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteReport(reportId: string) {
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId)

  if (error) throw error
}

// ============================================================================
// TICKETS FUNCTIONS
// ============================================================================

export async function createTicket(ticketData: Partial<Database['public']['Tables']['tickets']['Insert']>) {
  console.log('Creating ticket with data:', ticketData)
  const { data, error } = await supabase
    .from('tickets')
    .insert(ticketData)
    .select()
    .single()

  if (error) {
    console.error('Supabase insert error:', error)
    console.error('Error code:', error.code)
    console.error('Error message:', error.message)
    console.error('Error details:', error.details)
    console.error('Error hint:', error.hint)
    throw new Error(`Failed to create ticket: ${error.message} (code: ${error.code})`)
  }

  return data
}

export async function getTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (error) throw error
  return data as Database['public']['Tables']['tickets']['Row'][]
}

export async function getFive9Logouts() {
  const { data, error } = await supabase
    .from('five9')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Database['public']['Tables']['five9']['Row'][]
}

export async function getFive9LogoutIssues() {
  // Get all five9 logout records
  const { data, error } = await supabase
    .from('five9')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// ============================================================================
// AGENTS FUNCTIONS
// ============================================================================

export async function getUniqueTeamLeaders() {
  const { data, error } = await supabase
    .from('agents')
    .select('team_leader')
    .order('team_leader', { ascending: true })

  if (error) throw error

  // Get unique values
  const uniqueLeaders = Array.from(new Set(data.map(item => item.team_leader)))
  return uniqueLeaders
}

export async function getAllAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('name')
    .order('name', { ascending: true })

  if (error) throw error
  return data.map(agent => agent.name)
}

export async function getAgentsByTeamLeader(teamLeader: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('name')
    .eq('team_leader', teamLeader)
    .order('name', { ascending: true })

  if (error) throw error
  return data.map(agent => agent.name)
}

// ============================================================================
// TICKETS UPDATE FUNCTIONS
// ============================================================================

export async function updateTicket(ticketId: number, updates: Partial<Database['public']['Tables']['tickets']['Update']>) {
  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('ticketid', ticketId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// ANALYTICS FUNCTIONS
// ============================================================================

export async function getAnalytics(
  userId: string,
  metricName?: string,
  startDate?: string,
  endDate?: string
) {
  let query = supabase
    .from('analytics')
    .select('*')
    .eq('user_id', userId)

  if (metricName) {
    query = query.eq('metric_name', metricName)
  }

  if (startDate) {
    query = query.gte('metric_date', startDate)
  }

  if (endDate) {
    query = query.lte('metric_date', endDate)
  }

  const { data, error } = await query.order('metric_date', { ascending: false })

  if (error) throw error
  return data
}

export async function recordMetric(
  userId: string,
  metricName: string,
  metricValue: number,
  metricCategory?: string
) {
  const { data, error } = await supabase
    .from('analytics')
    .insert({
      user_id: userId,
      metric_name: metricName,
      metric_value: metricValue,
      metric_category: metricCategory,
      metric_date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// USER FUNCTIONS
// ============================================================================

export async function getUserProfile(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error) throw error
  return data
}

export async function updateUserProfile(
  email: string,
  updates: Partial<Database['public']['Tables']['users']['Update']>
) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('email', email)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('registered_at', { ascending: false })

  if (error) throw error
  return data as Database['public']['Tables']['users']['Row'][]
}

export async function updateUserStatus(email: string, is_active: boolean) {
  const { data, error } = await supabase
    .from('users')
    .update({ is_active })
    .eq('email', email)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateUserRole(email: string, role: string | null) {
  const { data, error } = await supabase
    .from('users')
    .update({ role })
    .eq('email', email)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateUserName(email: string, name: string | null) {
  const { data, error } = await supabase
    .from('users')
    .update({ name })
    .eq('email', email)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// AUDIT LOG FUNCTIONS
// ============================================================================

export async function logAuditEvent(
  userId: string,
  action: string,
  tableName: string,
  recordId?: string,
  oldValues?: any,
  newValues?: any
) {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_values: oldValues,
      new_values: newValues,
    })

  if (error) throw error
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / Math.abs(previous)) * 100
}
