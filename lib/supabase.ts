import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          email: string
          name: string | null
          password_hash: string | null
          role: string | null
          registered_at: string
          access: string | null
          avatar_image: string | null
          is_active: boolean | null
          last_login: string | null
          token: string | null
        }
        Insert: {
          email: string
          name?: string | null
          password_hash?: string | null
          role?: string | null
          registered_at?: string
          access?: string | null
          avatar_image?: string | null
          is_active?: boolean | null
          last_login?: string | null
          token?: string | null
        }
        Update: {
          name?: string | null
          password_hash?: string | null
          role?: string | null
          access?: string | null
          avatar_image?: string | null
          is_active?: boolean | null
          last_login?: string | null
          token?: string | null
        }
      }
      agents: {
        Row: {
          name: string
          team_leader: string | null
          setting: string | null
          role: string | null
          off_1: string | null
          off_2: string | null
          start_shift: string | null
          end_shift: string | null
          comments: string | null
          present: boolean | null
        }
        Insert: {
          name: string
          team_leader?: string | null
          setting?: string | null
          role?: string | null
          off_1?: string | null
          off_2?: string | null
          start_shift?: string | null
          end_shift?: string | null
          comments?: string | null
          present?: boolean | null
        }
        Update: {
          name?: string
          team_leader?: string | null
          setting?: string | null
          role?: string | null
          off_1?: string | null
          off_2?: string | null
          start_shift?: string | null
          end_shift?: string | null
          comments?: string | null
          present?: boolean | null
        }
      }
      tickets: {
        Row: {
          ticketid: number
          category: string | null
          concern: string | null
          date: string | null
          start_time: string | null
          name: string | null
          end_time: string | null
          troubleshooting: string | null
          assisted_by: string | null
          status: string | null
          team_leader: string | null
          onsite: boolean | null
          affected_five9: boolean | null
          webex_message_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          ticketid?: number
          category?: string | null
          concern?: string | null
          date?: string | null
          start_time?: string | null
          name?: string | null
          end_time?: string | null
          troubleshooting?: string | null
          assisted_by?: string | null
          status?: string | null
          team_leader?: string | null
          onsite?: boolean | null
          affected_five9?: boolean | null
          webex_message_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          ticketid?: number
          category?: string | null
          concern?: string | null
          date?: string | null
          start_time?: string | null
          name?: string | null
          end_time?: string | null
          troubleshooting?: string | null
          assisted_by?: string | null
          status?: string | null
          team_leader?: string | null
          onsite?: boolean | null
          affected_five9?: boolean | null
          webex_message_id?: string | null
          updated_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          report_data: any
          report_type: string | null
          export_format: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          report_data: any
          report_type?: string | null
          export_format?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          report_data?: any
          report_type?: string | null
          export_format?: string
          updated_at?: string
        }
      }
      analytics: {
        Row: {
          id: string
          user_id: string
          metric_name: string
          metric_value: number | null
          metric_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          metric_name: string
          metric_value?: number | null
          metric_date: string
          created_at?: string
        }
        Update: {
          metric_value?: number | null
        }
      }
      five9: {
        Row: {
          id: string
          name: string | null
          start_time: string | null
          end_time: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          start_time?: string | null
          end_time?: string | null
          created_at?: string
        }
        Update: {
          name?: string | null
          start_time?: string | null
          end_time?: string | null
        }
      }
      tph: {
        Row: {
          ticket_num: number
          agent: string | null
          status: string | null
          shift_date: string | null
          created_at: string
        }
        Insert: {
          ticket_num: number
          agent?: string | null
          status?: string | null
          shift_date?: string | null
          created_at?: string
        }
        Update: {
          agent?: string | null
          status?: string | null
          shift_date?: string | null
        }
      }
      tph_summary: {
        Row: {
          shift_date: string
          agent: string
          tickets: string | null
          hourly_tickets: string | null
          created_at: string
        }
        Insert: {
          shift_date: string
          agent: string
          tickets?: string | null
          hourly_tickets?: string | null
          created_at?: string
        }
        Update: {
          shift_date?: string
          agent?: string
          tickets?: string | null
          hourly_tickets?: string | null
          created_at?: string
        }
      }
    }
  }
}
