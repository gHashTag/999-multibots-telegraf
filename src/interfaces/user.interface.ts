import { TelegramId } from './telegram.interface'
import { SubscriptionType } from './subscription.interface'

/**
 * Интерфейс для пользователя из базы данных
 */
export interface User {
  id: number | string
  telegram_id: TelegramId
  username?: string
  first_name?: string
  last_name?: string
  bot_name?: string
  created_at?: string
  updated_at?: string
  gender?: string
  level?: number
  voiceId?: string
  finetuneId?: string
  aspectRatio?: string
  language?: string
  is_ru?: boolean
}
