// Database type definitions for TypeScript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      support_categories: {
        Row: {
          id: string
          name: string
          columns: Json
          is_quick_access: boolean
          quick_access_order: number
          sort_order: number
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          columns: Json
          is_quick_access?: boolean
          quick_access_order?: number
          sort_order?: number
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          columns?: Json
          is_quick_access?: boolean
          quick_access_order?: number
          sort_order?: number
          updated_by?: string | null
          updated_at?: string
        }
      }
      support_rows: {
        Row: {
          id: string
          category_id: string
          data: Json
          cell_formats: Json
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          data?: Json
          cell_formats?: Json
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          cell_formats?: Json
          updated_by?: string | null
          updated_at?: string
        }
      }
      support_revision: {
        Row: { id: boolean; version: number; updated_at: string }
        Insert: { id?: boolean; version?: number; updated_at?: string }
        Update: { version?: number; updated_at?: string }
      }
      users: {
        Row: {
          id: string
          email: string
          company: string | null
          name: string | null
          avatar_image: string | null
          created_at: string
          updated_at: string
          last_seen_changelog_sequence: number
        }
        Insert: {
          id?: string
          email: string
          company?: string | null
          name?: string | null
          avatar_image?: string | null
          created_at?: string
          updated_at?: string
          last_seen_changelog_sequence?: number
        }
        Update: {
          id?: string
          email?: string
          company?: string | null
          name?: string | null
          avatar_image?: string | null
          updated_at?: string
          last_seen_changelog_sequence?: number
        }
      }
      home_messages: {
        Row: {
          agent_email: string
          message_date: string
          message: string
          source_category: 'repeated_kpi_miss' | 'customer_praise' | 'kpi_improvement' | 'kpi_passing_streak' | 'current_kpi_miss' | 'period_summary' | 'survey_participation' | 'generic'
          generated_at: string
          refresh_used: boolean
        }
        Insert: {
          agent_email: string
          message_date: string
          message: string
          source_category: 'repeated_kpi_miss' | 'customer_praise' | 'kpi_improvement' | 'kpi_passing_streak' | 'current_kpi_miss' | 'period_summary' | 'survey_participation' | 'generic'
          generated_at?: string
          refresh_used?: boolean
        }
        Update: {
          message?: string
          source_category?: 'repeated_kpi_miss' | 'customer_praise' | 'kpi_improvement' | 'kpi_passing_streak' | 'current_kpi_miss' | 'period_summary' | 'survey_participation' | 'generic'
          generated_at?: string
          refresh_used?: boolean
        }
      }
      suggestions: {
        Row: {
          agent: string
          created_at: string
          suggest: string | null
        }
        Insert: {
          agent: string
          created_at?: string
          suggest?: string | null
        }
        Update: {
          agent?: string
          created_at?: string
          suggest?: string | null
        }
      }
      attendance: {
        Row: {
          agent: string
          shift_date: string
          time_in: string | null
          time_out: string | null
          pre_shift_ot_approved: boolean
          post_shift_ot_approved: boolean
          source: 'google_form_paste' | 'manual' | 'legacy' | 'self_service'
          pre_shift_ot_review: 'not_required' | 'pending' | 'approved' | 'rejected'
          post_shift_ot_review: 'not_required' | 'pending' | 'approved' | 'rejected'
          updated_by: string | null
          updated_at: string
          import_id: string | null
        }
        Insert: {
          agent: string
          shift_date: string
          time_in?: string | null
          time_out?: string | null
          pre_shift_ot_approved?: boolean
          post_shift_ot_approved?: boolean
          source?: 'google_form_paste' | 'manual' | 'legacy' | 'self_service'
          pre_shift_ot_review?: 'not_required' | 'pending' | 'approved' | 'rejected'
          post_shift_ot_review?: 'not_required' | 'pending' | 'approved' | 'rejected'
          updated_by?: string | null
          updated_at?: string
          import_id?: string | null
        }
        Update: {
          agent?: string
          shift_date?: string
          time_in?: string | null
          time_out?: string | null
          pre_shift_ot_approved?: boolean
          post_shift_ot_approved?: boolean
          source?: 'google_form_paste' | 'manual' | 'legacy' | 'self_service'
          pre_shift_ot_review?: 'not_required' | 'pending' | 'approved' | 'rejected'
          post_shift_ot_review?: 'not_required' | 'pending' | 'approved' | 'rejected'
          updated_by?: string | null
          updated_at?: string
          import_id?: string | null
        }
      }
      attendance_imports: {
        Row: { id: string; shift_date: string; source: 'google_form_paste' | 'manual'; accepted_agents: number; created_by: string; created_at: string }
        Insert: { id?: string; shift_date: string; source: 'google_form_paste' | 'manual'; accepted_agents?: number; created_by: string; created_at?: string }
        Update: { accepted_agents?: number }
      }
      attendance_day_outcomes: {
        Row: { agent_email: string; shift_date: string; outcome: 'confirmed_absent' | 'not_absent'; note: string | null; updated_by: string; updated_at: string }
        Insert: { agent_email: string; shift_date: string; outcome: 'confirmed_absent' | 'not_absent'; note?: string | null; updated_by: string; updated_at?: string }
        Update: { outcome?: 'confirmed_absent' | 'not_absent'; note?: string | null; updated_by?: string; updated_at?: string }
      }
      attendance_day_outcome_audit: {
        Row: { id: number; agent_email: string; shift_date: string; prior_value: Json | null; new_value: Json; changed_by: string; changed_at: string }
        Insert: { agent_email: string; shift_date: string; prior_value?: Json | null; new_value: Json; changed_by: string; changed_at?: string }
        Update: never
      }
      attendance_tracker_order: {
        Row: { agent_email: string; position: number; updated_by: string; updated_at: string }
        Insert: { agent_email: string; position: number; updated_by: string; updated_at?: string }
        Update: { position?: number; updated_by?: string; updated_at?: string }
      }
      attendance_schedule_versions: {
        Row: { id: string; effective_from: string; note: string | null; created_by: string; created_at: string }
        Insert: { id?: string; effective_from: string; note?: string | null; created_by: string; created_at?: string }
        Update: never
      }
      attendance_schedule_entries: {
        Row: { version_id: string; agent_email: string; agent_name: string; team_leader: string | null; start_shift: string; end_shift: string; off_1: string; off_2: string; shift_group: 'normal_graveyard' | 'overnight' }
        Insert: { version_id: string; agent_email: string; agent_name: string; team_leader?: string | null; start_shift?: string; end_shift?: string; off_1?: string; off_2?: string; shift_group?: 'normal_graveyard' | 'overnight' }
        Update: never
      }
      attendance_schedule_exceptions: {
        Row: { id: string; agent_email: string; shift_date: string; kind: 'holiday_off' | 'vacation_leave' | 'sick_leave' | 'transition_off' | 'day_off' | 'absent' | 'scheduled'; start_shift: string | null; end_shift: string | null; note: string | null; updated_by: string; updated_at: string }
        Insert: { id?: string; agent_email: string; shift_date: string; kind: 'holiday_off' | 'vacation_leave' | 'sick_leave' | 'transition_off' | 'day_off' | 'absent' | 'scheduled'; start_shift?: string | null; end_shift?: string | null; note?: string | null; updated_by: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['attendance_schedule_exceptions']['Insert']>
      }
      attendance_schedule_exception_audit: {
        Row: { id: number; exception_id: string | null; agent_email: string; shift_date: string; prior_value: Json | null; new_value: Json; changed_by: string; changed_at: string }
        Insert: { exception_id?: string | null; agent_email: string; shift_date: string; prior_value?: Json | null; new_value: Json; changed_by: string; changed_at?: string }
        Update: never
      }
      attendance_clock_agent_policy: {
        Row: { agent_email: string; self_service_enabled: boolean; is_wfh: boolean; updated_by: string; updated_at: string }
        Insert: { agent_email: string; self_service_enabled?: boolean; is_wfh?: boolean; updated_by: string; updated_at?: string }
        Update: { self_service_enabled?: boolean; is_wfh?: boolean; updated_by?: string; updated_at?: string }
      }
      attendance_clock_policy_audit: {
        Row: { id: number; agent_email: string; changed_field: 'self_service_enabled' | 'is_wfh'; prior_value: boolean; new_value: boolean; changed_by: string; changed_at: string }
        Insert: { agent_email: string; changed_field: 'self_service_enabled' | 'is_wfh'; prior_value: boolean; new_value: boolean; changed_by: string; changed_at?: string }
        Update: never
      }
      attendance_office_networks: {
        Row: { id: string; label: string; network: string; updated_by: string; updated_at: string }
        Insert: { id?: string; label: string; network: string; updated_by: string; updated_at?: string }
        Update: { label?: string; network?: string; updated_by?: string; updated_at?: string }
      }
      attendance_clock_events: {
        Row: { id: string; request_id: string; agent_email: string; shift_date: string; action: 'time_in' | 'time_out'; source_surface: 'attendance' | 'home'; clock_value: string; recorded_at: string; ip_address: string | null; user_agent: string | null; network_status: 'office' | 'offsite_flagged' | 'wfh_exempt' | 'unknown_ip_flagged' | 'unconfigured'; prior_value: Json | null; new_value: Json }
        Insert: { id?: string; request_id: string; agent_email: string; shift_date: string; action: 'time_in' | 'time_out'; source_surface: 'attendance' | 'home'; clock_value: string; recorded_at: string; ip_address?: string | null; user_agent?: string | null; network_status: 'office' | 'offsite_flagged' | 'wfh_exempt' | 'unknown_ip_flagged' | 'unconfigured'; prior_value?: Json | null; new_value: Json }
        Update: never
      }
      attendance_overtime_review_audit: {
        Row: { id: number; agent_email: string; shift_date: string; review_field: 'pre_shift' | 'post_shift'; prior_status: string; new_status: 'approved' | 'rejected'; reviewed_by: string; reviewed_at: string }
        Insert: { agent_email: string; shift_date: string; review_field: 'pre_shift' | 'post_shift'; prior_status: string; new_status: 'approved' | 'rejected'; reviewed_by: string; reviewed_at?: string }
        Update: never
      }
      feature_settings: {
        Row: {
          key: string
          enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
      }
      agents: {
        Row: {
          name: string
          email: string | null
          team_leader: string | null
          role: string | null
          off_1: string | null
          off_2: string | null
          start_shift: string | null
          end_shift: string | null
          comments: string | null
          present: boolean | null
          presence_updated_at: string | null
        }
        Insert: {
          name: string
          email?: string | null
          team_leader?: string | null
          role?: string | null
          off_1?: string | null
          off_2?: string | null
          start_shift?: string | null
          end_shift?: string | null
          comments?: string | null
          present?: boolean | null
          presence_updated_at?: string | null
        }
        Update: {
          name?: string
          email?: string | null
          team_leader?: string | null
          role?: string | null
          off_1?: string | null
          off_2?: string | null
          start_shift?: string | null
          end_shift?: string | null
          comments?: string | null
          present?: boolean | null
          presence_updated_at?: string | null
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
          history: Json
          notes: Json
          reported: boolean
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
          history?: Json
          notes?: Json
          reported?: boolean
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
          history?: Json
          notes?: Json
          reported?: boolean
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
    Functions: {
      bulk_delete_support_rows: {
        Args: { p_row_ids: string[] }
        Returns: number
      }
      get_support_payload: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      bulk_insert_support_rows: {
        Args: { p_category_id: string; p_rows: Json; p_actor: string }
        Returns: number
      }
      reconcile_agents: {
        Args: {
          p_updates?: Json
          p_new_agents?: Json
          p_delete_names?: string[]
        }
        Returns: Json
      }
      acknowledge_changelog: {
        Args: { p_user_email: string; p_sequence: number }
        Returns: number
      }
      replace_attendance_tracker_order: { Args: { p_entries: Json; p_actor: string }; Returns: number }
      commit_attendance_rows: { Args: { p_shift_date: string; p_source: string; p_actor: string; p_rows: Json }; Returns: Json }
      commit_attendance_rows_by_date: { Args: { p_shift_date: string; p_source: string; p_actor: string; p_rows: Json }; Returns: Json }
      commit_attendance_rows_with_overtime: { Args: { p_shift_date: string; p_source: string; p_actor: string; p_rows: Json }; Returns: Json }
      commit_attendance_with_outcomes: { Args: { p_shift_date: string; p_source: string; p_actor: string; p_rows: Json; p_outcomes: Json }; Returns: Json }
      create_attendance_schedule_version: { Args: { p_effective_from: string; p_note: string; p_entries: Json; p_actor: string }; Returns: string }
      upsert_attendance_schedule_exceptions: { Args: { p_entries: Json; p_actor: string }; Returns: number }
      replace_attendance_clock_pilot: { Args: { p_agent_emails: string[]; p_actor: string }; Returns: number }
      replace_attendance_clock_wfh: { Args: { p_agent_emails: string[]; p_actor: string }; Returns: number }
      replace_attendance_office_networks: { Args: { p_entries: Json; p_actor: string }; Returns: number }
      classify_attendance_network: { Args: { p_ip: string | null; p_is_wfh: boolean }; Returns: string }
      clock_attendance_self_service: { Args: { p_agent_email: string; p_shift_date: string; p_action: string; p_surface: string; p_request_id: string; p_recorded_at: string; p_ip: string | null; p_user_agent: string; p_network_status: string; p_ot_review: string }; Returns: Json }
      review_attendance_overtime: { Args: { p_agent_email: string; p_shift_date: string; p_review_field: string; p_decision: string; p_actor: string; p_expected_updated_at: string | null }; Returns: Json }
    }
  }
}
