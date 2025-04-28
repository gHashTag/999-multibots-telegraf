import { VIDEO_MODELS_CONFIG } from '@/config/models.config'

// Определяем тип ключей из конфига
export type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

export interface VideoModelConfig {
  id: string
  title: string
  description: string
  inputType: ('text' | 'image')[]
  basePrice: number // Base price in dollars
  api: {
    model: string
    input: Record<string, any>
  }
  requirements?: {
    minBalance?: number
    maxDuration?: number
  }
  imageKey?: string
}

// Заменяем использование VideoModel на VideoModelKey
export const VIDEO_MODELS: Record<VideoModelKey, VideoModelConfig> =
  VIDEO_MODELS_CONFIG

// Дополнительные режимы, не входящие в ModeEnum
export type AdditionalMode =
  | 'start_learning'
  | 'top_up_balance'
  | 'balance'
  | 'main_menu'
  | 'improve_prompt'
  | 'change_size'
  | 'getRuBill'
  | 'getEmailWizard'
  | 'price'
  | 'video_in_url'
  | 'support'
  | 'stats'
  | 'invite'
  | 'help'
