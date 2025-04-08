/**
 * @fileoverview Базовые типы схемы Supabase
 * @description Определяет основную структуру базы данных и типы данных
 *
 * Этот файл содержит:
 * - Определение JSON-типов
 * - Основную схему базы данных
 * - Типы для всех таблиц и их отношений
 *
 * @note Этот файл автоматически генерируется из схемы Supabase
 * Не редактируйте его вручную!
 */

/**
 * Тип для JSON-данных
 * Поддерживает вложенные структуры данных
 * @typedef {(string|number|boolean|null|object|array)} Json
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Основная схема базы данных Supabase
 * @interface SupabaseSchema
 * @description Определяет структуру всех таблиц и их отношений
 *
 * @property {object} public.Tables.assets - Таблица медиа-ресурсов
 * @property {object} public.Tables.payments_v2 - Таблица платежей
 * @property {object} public.Tables.users - Таблица пользователей
 * @property {object} public.Tables.subscriptions - Таблица подписок
 * @property {object} public.Tables.referrals - Таблица рефералов
 */
export interface SupabaseSchema {
  public: {
    Tables: {
      assets: {
        Row: {
          bot_name: string | null
          created_at: string | null
          id: number
          telegram_id: string | null
          type: string | null
          url: string | null
        }
        Insert: {
          bot_name?: string | null
          created_at?: string | null
          id?: number
          telegram_id?: string | null
          type?: string | null
          url?: string | null
        }
        Update: {
          bot_name?: string | null
          created_at?: string | null
          id?: number
          telegram_id?: string | null
          type?: string | null
          url?: string | null
        }
        Relationships: []
      }
      payments_v2: {
        Row: {
          id: number
          telegram_id: string
          bot_name: string
          service_type: string
          type: string
          status: string
          amount: number
          stars: number | null
          payment_method: string
          operation_id: string | null
          inv_id: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
          settings: Json | null
        }
        Insert: {
          id?: number
          telegram_id: string
          bot_name: string
          service_type: string
          type: string
          status: string
          amount: number
          stars?: number | null
          payment_method: string
          operation_id?: string | null
          inv_id?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          settings?: Json | null
        }
        Update: {
          id?: number
          telegram_id?: string
          bot_name?: string
          service_type?: string
          type?: string
          status?: string
          amount?: number
          stars?: number | null
          payment_method?: string
          operation_id?: string | null
          inv_id?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          settings?: Json | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          id: number
          telegram_id: string
          updated_at: string | null
          username: string | null
          first_name: string | null
          last_name: string | null
          language_code: string | null
          is_premium: boolean | null
          is_bot: boolean | null
          last_activity: string | null
          referral_code: string | null
          referred_by: string | null
          settings: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          telegram_id: string
          updated_at?: string | null
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          language_code?: string | null
          is_premium?: boolean | null
          is_bot?: boolean | null
          last_activity?: string | null
          referral_code?: string | null
          referred_by?: string | null
          settings?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: number
          telegram_id?: string
          updated_at?: string | null
          username?: string | null
          first_name?: string | null
          last_name?: string | null
          language_code?: string | null
          is_premium?: boolean | null
          is_bot?: boolean | null
          last_activity?: string | null
          referral_code?: string | null
          referred_by?: string | null
          settings?: Json | null
        }
        Relationships: []
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
