// ============================================================================
// Type definitions for the application
// ============================================================================

export interface User {
  id: string
  email: string
  user_metadata?: {
    name?: string
    company?: string
    avatar_url?: string
  }
}

export interface Report {
  id: string
  user_id: string
  title: string
  description?: string
  report_data: any
  report_type: string
  export_format: string
  file_url?: string
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface Analytics {
  id: string
  user_id: string
  metric_name: string
  metric_value: number | null
  metric_category?: string
  metric_date: string
  created_at: string
}

export interface StatMetric {
  icon: React.ReactNode
  label: string
  value: string
  change: string
  trend: 'up' | 'down'
  color: 'primary' | 'secondary' | 'tertiary'
}

export interface ChartData {
  title: string
  description: string
  data: number[]
  labels: string[]
  type: 'line' | 'doughnut' | 'bar'
}
