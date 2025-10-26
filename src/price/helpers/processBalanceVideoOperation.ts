/**
 * @deprecated Используйте BalanceOperationProcessor напрямую
 * Этот файл сохранен для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await processBalanceVideoOperation(ctx, configKey, isRu)
 * ```
 *
 * Стало:
 * ```
 * import { BalanceOperationProcessor } from '@/price/helpers/BalanceOperationProcessor'
 * await BalanceOperationProcessor.processVideoOperation(
 *   ctx, configKey, isRu, calculateFinalPrice, selectedModelConfig
 * )
 * ```
 */

import { BalanceOperationResult, MyContext } from '@/interfaces'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { calculateFinalPrice } from './calculateFinalPrice'
import { logger } from '@/utils/enhancedLogger'
import { BalanceOperationProcessor } from './BalanceOperationProcessor'

/**
 * @deprecated Используйте BalanceOperationProcessor.processVideoOperation
 * Обрабатывает операцию с балансом для видео
 */
export const processBalanceVideoOperation = async (
  ctx: MyContext,
  configKey: keyof typeof VIDEO_MODELS_CONFIG,
  isRu: boolean
): Promise<BalanceOperationResult> => {
  logger.info('🔍 [processBalanceVideoOperation] Вызов функции (совместимость):', {
    configKey,
  })

  // Получаем конфигурацию модели
  const selectedModelConfig = VIDEO_MODELS_CONFIG[configKey]

  if (!selectedModelConfig) {
    logger.error('Invalid config key, model not found:', { configKey })
    const errorMsg = isRu
      ? 'Ошибка конфигурации для выбранной модели.'
      : 'Configuration error for selected model.'
    return {
      success: false,
      error: errorMsg,
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  // Используем новый унифицированный обработчик
  return BalanceOperationProcessor.processVideoOperation(
    ctx,
    configKey,
    isRu,
    calculateFinalPrice,
    selectedModelConfig
  )
}
