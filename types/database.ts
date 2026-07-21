// Database type definitions for TypeScript
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          company: string | null
          name: string | null
          avatar_image: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          company?: string | null
          name?: string | null
          avatar_image?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          company?: string | null
          name?: string | null
          avatar_image?: string | null
          updated_at?: string
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
      stats: {
        Row: {
          id: string
          supervisor: string
          name: string
          acw: string | null
          aht: string | null
          hold: string | null
          talk_time: string | null
          csat_score: string | null
          dsat: string | null
          nps_score: number | null
          promoter: number | null
          mod: string | null
          mod_value: number | null
          fcr: string | null
          fcr_value: number | null
          surveys_answered: number | null
          calls_touched: number | null
          tickets_solved: number | null
          transactions: number | null
          productive_hours: string | null
          tph: number | null
          week: number
          range: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          supervisor: string
          name: string
          acw?: string | null
          aht?: string | null
          hold?: string | null
          talk_time?: string | null
          csat_score?: string | null
          dsat?: string | null
          nps_score?: number | null
          promoter?: number | null
          mod?: string | null
          mod_value?: number | null
          fcr?: string | null
          fcr_value?: number | null
          surveys_answered?: number | null
          calls_touched?: number | null
          tickets_solved?: number | null
          transactions?: number | null
          productive_hours?: string | null
          tph?: number | null
          week?: number
          range?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          supervisor?: string
          name?: string
          acw?: string | null
          aht?: string | null
          hold?: string | null
          talk_time?: string | null
          csat_score?: string | null
          dsat?: string | null
          nps_score?: number | null
          promoter?: number | null
          mod?: string | null
          mod_value?: number | null
          fcr?: string | null
          fcr_value?: number | null
          surveys_answered?: number | null
          calls_touched?: number | null
          tickets_solved?: number | null
          transactions?: number | null
          productive_hours?: string | null
          tph?: number | null
          week?: number
          range?: number
          updated_at?: string
        }
      }
      survey: {
        Row: {
          survey_date: string | null
          response_id: string
          agent: string
          csat: 'Unsatisfied' | 'Neutral' | 'Satisfied'
          mod_comment: string | null
          open_comment: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          survey_date?: string | null
          response_id: string
          agent: string
          csat: 'Unsatisfied' | 'Neutral' | 'Satisfied'
          mod_comment?: string | null
          open_comment?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          survey_date?: string | null
          response_id?: string
          agent?: string
          csat?: 'Unsatisfied' | 'Neutral' | 'Satisfied'
          mod_comment?: string | null
          open_comment?: string | null
          updated_at?: string
        }
      }
    }
  }
}
