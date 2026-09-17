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
  /**
   * The Telegram profile photo, stored at registration by createUserScene with
   * the bot's own photo as a fallback. `select('*')` has always returned it;
   * the type simply did not say so, so every reader had to cast.
   */
  photo_url?: string | null
  voiceId?: string
  finetuneId?: string
  aspectRatio?: string
  language?: string
  is_ru?: boolean
}
