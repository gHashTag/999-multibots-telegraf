export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: {
          bot_name: string | null
          created_at: string | null
          id: number
          public_url: string
          storage_path: string
          telegram_id: number | null
          text: string | null
          trigger_word: string
          type: string
        }
        Insert: {
          bot_name?: string | null
          created_at?: string | null
          id?: number
          public_url: string
          storage_path: string
          telegram_id?: number | null
          text?: string | null
          trigger_word: string
          type: string
        }
        Update: {
          bot_name?: string | null
          created_at?: string | null
          id?: number
          public_url?: string
          storage_path?: string
          telegram_id?: number | null
          text?: string | null
          trigger_word?: string
          type?: string
        }
      }
      avatars: {
        Row: {
          avatar_url: string
          bot_name: string
          created_at: string
          group: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          avatar_url: string
          bot_name?: string
          created_at?: string
          group: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          bot_name?: string
          created_at?: string
          group?: string
          telegram_id?: number
          updated_at?: string
        }
      }
      payments_v2: {
        Row: {
          amount: number
          bot_name: string
          currency: string
          description: string | null
          inv_id: string | null
          invoice_url: string | null
          language: string | null
          metadata: Json | null
          operation_id: string | null
          payment_date: string
          payment_id: number
          payment_method: string | null
          service_type: string | null
          stars: number
          status: Database['public']['Enums']['payment_status']
          telegram_id: number
          type: Database['public']['Enums']['operation_type']
        }
        Insert: {
          amount?: number
          bot_name: string
          currency?: string
          description?: string | null
          inv_id?: string | null
          invoice_url?: string | null
          language?: string | null
          metadata?: Json | null
          operation_id?: string | null
          payment_date?: string
          payment_id?: number
          payment_method?: string | null
          service_type?: string | null
          stars?: number
          status: Database['public']['Enums']['payment_status']
          telegram_id: number
          type: Database['public']['Enums']['operation_type']
        }
        Update: {
          amount?: number
          bot_name?: string
          currency?: string
          description?: string | null
          inv_id?: string | null
          invoice_url?: string | null
          language?: string | null
          metadata?: Json | null
          operation_id?: string | null
          payment_date?: string
          payment_id?: number
          payment_method?: string | null
          service_type?: string | null
          stars?: number
          status?: Database['public']['Enums']['payment_status']
          telegram_id?: number
          type?: Database['public']['Enums']['operation_type']
        }
      }
      users: {
        Row: {
          aspect_ratio: string | null
          avatar_id: string | null
          avatar_url: string | null
          bot_name: string
          chat_id: number | null
          company: string | null
          count: number | null
          created_at: string
          designation: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: number
          invitation_codes: Json | null
          inviter: string | null
          is_active: boolean | null
          is_bot: boolean | null
          is_bot_owner: boolean | null
          is_leela_start: boolean | null
          language_code: string | null
          last_name: string | null
          level: number
          mode: string | null
          model: string | null
          photo_url: string | null
          pinata_avatar_id: string | null
          position: string | null
          role: string | null
          select_izbushka: number | null
          subscription: string | null
          telegram_id: number | null
          updated_at: string | null
          user_id: string
          user_timezone: string | null
          username: string | null
          vip: boolean | null
          voice_id: string | null
          voice_id_elevenlabs: string | null
          voice_id_synclabs: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          avatar_url?: string | null
          bot_name?: string
          chat_id?: number | null
          company?: string | null
          count?: number | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          invitation_codes?: Json | null
          inviter?: string | null
          is_active?: boolean | null
          is_bot?: boolean | null
          is_bot_owner?: boolean | null
          is_leela_start?: boolean | null
          language_code?: string | null
          last_name?: string | null
          level?: number
          mode?: string | null
          model?: string | null
          photo_url?: string | null
          pinata_avatar_id?: string | null
          position?: string | null
          role?: string | null
          select_izbushka?: number | null
          subscription?: string | null
          telegram_id?: number | null
          updated_at?: string | null
          user_id?: string
          user_timezone?: string | null
          username?: string | null
          vip?: boolean | null
          voice_id?: string | null
          voice_id_elevenlabs?: string | null
          voice_id_synclabs?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          avatar_url?: string | null
          bot_name?: string
          chat_id?: number | null
          company?: string | null
          count?: number | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          invitation_codes?: Json | null
          inviter?: string | null
          is_active?: boolean | null
          is_bot?: boolean | null
          is_bot_owner?: boolean | null
          is_leela_start?: boolean | null
          language_code?: string | null
          last_name?: string | null
          level?: number
          mode?: string | null
          model?: string | null
          photo_url?: string | null
          pinata_avatar_id?: string | null
          position?: string | null
          role?: string | null
          select_izbushka?: number | null
          subscription?: string | null
          telegram_id?: number | null
          updated_at?: string | null
          user_id?: string
          user_timezone?: string | null
          username?: string | null
          vip?: boolean | null
          voice_id?: string | null
          voice_id_elevenlabs?: string | null
          voice_id_synclabs?: string | null
        }
      }
    }
    Enums: {
      operation_type:
        | 'money_income'
        | 'money_expense'
        | 'subscription_purchase'
        | 'subscription_renewal'
        | 'refund'
        | 'bonus'
        | 'referral'
        | 'system'
      payment_status: 'PENDING' | 'COMPLETED' | 'FAILED'
      payment_type: 'regular' | 'bonus' | 'system' | 'test'
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
