import { TelegramId } from './telegram.interface'
import { SubscriptionType } from './subscription.interface'

/**
 * Интерфейс для пользователя из базы данных
 */
export interface User {
  id: number | string
  telegram_id: string
  username: string
  first_name?: string
  last_name?: string
  balance: number
  stars?: number | null
  level?: number | null
  invited_by_user_id?: number | null
  invited_user_id?: number | null
  created_at?: Date
  updated_at?: Date
  email?: string | null
  isAdmin?: boolean
  neuro_token?: number
  is_bot_blocked?: boolean
  is_ru?: boolean
  api_token?: string
  api_key_elevenlabs?: string
  replicate_username?: string
  api?: string | null
}
