import { logger } from '@/utils/logger'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { calculateFinalPrice } from './calculateFinalPrice'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

/**
 * @deprecated Use processBalanceVideoOperation instead for comprehensive checks.
 * Validates the video model and calculates its price.
 */
export const validateAndCalculateVideoModelPrice = (
  videoModel: VideoModelKey // Используем ключ конфига
): number | null => {
  logger.warn(
    'Deprecated function called: validateAndCalculateVideoModelPrice. Use processBalanceVideoOperation instead.'
  )
  try {
    // Проверяем, существует ли модель с таким ключом в конфиге
    if (!(videoModel in VIDEO_MODELS_CONFIG)) {
      logger.error('Invalid video model key provided:', { videoModel })
      return null
    }
    // Рассчитываем цену, используя ключ конфига
    const price = calculateFinalPrice(videoModel)
    return price
  } catch (error) {
    logger.error('Error calculating video model price:', { videoModel, error })
    return null
  }
}
