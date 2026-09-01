import { logger } from '@/utils/logger'
import {
  getUnifiedModelConfig,
  getUnifiedModelPrice,
} from '@/config/unified-video-models.config'

/**
 * @deprecated Use processBalanceVideoOperationHelper (modules/videoGenerator/helpers) instead.
 * Validates the video model and calculates its price.
 */
export const validateAndCalculateVideoModelPrice = (
  videoModel: string // Model ID
): number | null => {
  logger.warn(
    'Deprecated function called: validateAndCalculateVideoModelPrice. Use processBalanceVideoOperationHelper instead.'
  )
  try {
    // ✅ Проверяем существование модели через unified config
    const modelConfig = getUnifiedModelConfig(videoModel)
    if (!modelConfig) {
      logger.error('Invalid video model key provided:', { videoModel })
      return null
    }
    // ✅ Рассчитываем цену через unified config
    const price = getUnifiedModelPrice(videoModel)
    return price
  } catch (error) {
    logger.error('Error calculating video model price:', { videoModel, error })
    return null
  }
}
