import { VIDEO_MODELS_CONFIG } from '@/pricing/config/VIDEO_MODELS_CONFIG'
import { logger } from '@/utils/logger'

/**
 * Проверяет видео-модель и (раньше) рассчитывал ее стоимость.
 * Теперь просто проверяет наличие модели.
 *
 * @param videoModel - Ключ модели.
 * @returns true, если модель существует, иначе false.
 */
export function validateVideoModel(videoModel: string): boolean {
  if (!videoModel || !(videoModel in VIDEO_MODELS_CONFIG)) {
    logger.warn('Invalid or unknown video model selected', { videoModel })
    return false
  }

  // Старый расчет цены удален, т.к. он делается в калькуляторе
  // const price = calculateFinalPrice(videoModel)
  // if (price === null) {
  //   logger.error('Error calculating price for validated model', { videoModel })
  //   return false // Считаем невалидной, если цену не рассчитать?
  // }

  return true // Модель существует
}
