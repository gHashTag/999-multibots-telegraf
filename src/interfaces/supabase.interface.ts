import { TelegramId } from './telegram.interface'
import {
  SubscriptionType,
  Subscription as SubscriptionInterface,
} from './subscription.interface'

export interface CreateUserData {
  username: string
  telegram_id: TelegramId
  first_name: string
  last_name: string
  is_bot: boolean
  language_code: string
  photo_url: string
  chat_id: number
  mode: string
  model: string
  count: number
  aspect_ratio: string
  inviter: string | null
  bot_name: string
}

export interface ModelTraining {
  model_name: string
  trigger_word: string
  model_url: string
  finetune_id: string
}

export interface UserType {
  id: bigint
  created_at: Date
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  is_bot?: boolean | null
  language_code?: string | null
  telegram_id?: bigint | null
  email?: string | null
  photo_url?: string | null
  user_id: string // UUID
  // balance?: number | null; // 🕉️ Поле удалено, т.к. баланс теперь в 'payments_v2'
  role?: string | null
  display_name?: string | null
  user_timezone?: string | null
  designation?: string | null
  position?: string | null
  company?: string | null
  invitation_codes?: Record<string, any> | null // JSON
  select_izbushka?: bigint | null
  avatar_id?: string | null
  voice_id?: string | null
  voice_id_elevenlabs?: string | null
  chat_id?: bigint | null
  voice_id_synclabs?: string | null
  mode?: string | null
  model?: string | null
  count?: number | null
  aspect_ratio?: string | null
  inviter?: string | null // UUID
  vip?: boolean | null
  level?: number
  token?: string | null
  is_leela_start?: boolean | null
}

export interface TranslationContext {
  from: { language_code: string }
  telegram: { token: string }
}

export interface TranslationButton {
  text: string
  callback_data: string
  description: string
  row: number
  en_price: number
  ru_price: number
  stars_price: number
  subscription: SubscriptionType
}

// Новый интерфейс для настроек пользователя
export interface UserSettings {
  imageModel: string | null
  // Добавьте другие настройки по мере необходимости
  // videoModel?: string | null;
}
