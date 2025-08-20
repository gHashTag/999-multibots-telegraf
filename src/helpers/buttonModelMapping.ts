import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { calculateFinalPrice } from '@/price/helpers'
import { logger } from '@/utils/logger'

export type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

/**
 * Находит ключ модели по тексту кнопки, учитывая цену в звездочках
 */
export function findModelByButtonText(
  buttonText: string
): VideoModelConfigKey | null {
  logger.info('[findModelByButtonText] Searching for model by button text:', {
    buttonText,
  })

  let foundModelKey: VideoModelConfigKey | null = null

  for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
    const finalPriceInStars = calculateFinalPrice(key as VideoModelConfigKey)
    const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)`

    logger.debug('[findModelByButtonText] Comparing:', {
      expectedButtonText,
      actualButtonText: buttonText,
      match: expectedButtonText === buttonText,
    })

    if (expectedButtonText === buttonText) {
      foundModelKey = key as VideoModelConfigKey
      break
    }
  }

  logger.info('[findModelByButtonText] Search result:', {
    buttonText,
    foundModelKey,
  })

  return foundModelKey
}
