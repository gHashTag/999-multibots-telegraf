import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from '@/modules/videoGenerator/config/models.config' // Import both value and type
import { calculateFinalPrice } from '@/price/helpers'
import { Markup } from 'telegraf' // Import Markup

// Определяем тип ключей из конфига
export type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

// Удаляем локальное определение VIDEO_MODELS
// export const VIDEO_MODELS: Record<VideoModelKey, VideoModelConfig> =
//   VIDEO_MODELS_CONFIG

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

// Function to get model config directly from the imported config
export const getVideoModelConfig = (
  key: VideoModelKey
): VideoModelConfig | undefined => {
  // Use the imported config directly
  return VIDEO_MODELS_CONFIG[key]
}

// Function to generate keyboard using the imported config directly
export const generateVideoModelKeyboard = (isRu: boolean) => {
  // Use the imported config directly
  const buttons = Object.entries(VIDEO_MODELS_CONFIG)
    .map(([key, config]) => {
      // Filter out models that shouldn't be shown?
      // if (config.inputType.includes('dev')) return null; // Example filter

      const finalPrice = calculateFinalPrice(key) // Pass the key
      return Markup.button.callback(
        `${config.title} (${finalPrice} ⭐)`,
        `select_video_model_${key}`
      )
    })
    .filter(button => button !== null) // Filter out nulls if using filters

  // Make sure buttons is not empty before creating keyboard
  if (!buttons.length) {
    // Handle the case where no models are available (e.g., return null or an empty keyboard)
    return Markup.inlineKeyboard([])
  }

  return Markup.inlineKeyboard(buttons as any, { columns: 2 }) // Cast to any if filter causes type issue
}
