import { getUserBalance } from '@/core/supabase/getUserBalance' // Keep imports for now
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult } from '@/interfaces' // Keep imports for now
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config' // Keep imports for now
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice' // Keep imports for now

import { logger } from '@/utils/logger' // Keep logger import
import { PaymentType } from '@/interfaces/payments.interface' // Keep imports for now

/**
 * Обрабатывает операцию с балансом для видео (Изолированная версия)
 */
export const processBalanceVideoOperationHelper = async (
  telegramId: string, // Removed ctx dependency
  modelId: string, // Changed configKey to modelId for clarity
  isRu: boolean,
  botName: string, // Added botName
  serviceType: string = 'image-to-video' // Добавляем параметр для типа сервиса
): Promise<BalanceOperationResult> => {
  let currentBalanceAtStart = 0

  if (!telegramId) {
    logger.error('processBalanceVideoOperationHelper: User ID not found')
    return {
      success: false,
      error: 'User ID not found',
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  logger.info('Processing video balance operation (Helper) for model:', {
    modelId,
    telegramId,
  })

  // Ищем конфигурацию по ключу
  const selectedModelConfig = VIDEO_MODELS_CONFIG[modelId]

  if (!selectedModelConfig) {
    logger.error(
      'processBalanceVideoOperationHelper: Invalid modelId received, model not found:',
      { modelId }
    )
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

  let paymentAmount = 0
  let modePrice = 0
  try {
    // Рассчитываем цену, передавая КЛЮЧ КОНФИГА (modelId)
    paymentAmount = calculateFinalPrice(modelId)
    modePrice = paymentAmount
  } catch (costError) {
    logger.error('processBalanceVideoOperationHelper: Error calculating cost', {
      modelId,
      error: costError,
    })
    const errorMsg = isRu
      ? 'Ошибка расчета стоимости.'
      : 'Error calculating cost.'
    return {
      success: false,
      error: errorMsg,
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  try {
    currentBalanceAtStart = await getUserBalance(telegramId) // Direct call for now

    if (currentBalanceAtStart < paymentAmount) {
      const message = isRu
        ? 'Недостаточно средств на балансе. Пополните баланс в главном меню.'
        : 'Insufficient funds. Top up your balance in the main menu.'
      logger.warn('processBalanceVideoOperationHelper: Insufficient funds', {
        telegramId,
        currentBalance: currentBalanceAtStart,
        paymentAmount,
        modelId,
      })
      return {
        success: false,
        error: message,
        newBalance: currentBalanceAtStart,
        modePrice,
        paymentAmount: paymentAmount,
        currentBalance: currentBalanceAtStart,
      }
    }

    const newBalance = currentBalanceAtStart - paymentAmount

    // Removed ctx.session.mode, assuming 'image-to-video' or similar generic type
    const updateSuccess = await updateUserBalance(
      telegramId,
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      `Video generation (${selectedModelConfig.title})`,
      {
        bot_name: botName, // Use passed botName
        service_type: serviceType, // Use the provided serviceType
        model_name: modelId, // Исправляем на model_name для соответствия схеме БД
        modePrice,
        currentBalance: currentBalanceAtStart,
        paymentAmount: paymentAmount,
      }
    )

    if (!updateSuccess) {
      const message = isRu
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      logger.error(
        'processBalanceVideoOperationHelper: Failed to update balance',
        { telegramId, modelId }
      )
      return {
        success: false,
        error: message,
        newBalance: currentBalanceAtStart,
        modePrice,
        paymentAmount: paymentAmount,
        currentBalance: currentBalanceAtStart,
      }
    }

    logger.info(
      'processBalanceVideoOperationHelper: Balance updated successfully',
      { telegramId, newBalance, paymentAmount, modelId }
    )
    return {
      success: true,
      newBalance,
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceAtStart,
    }
  } catch (error) {
    logger.error(
      'processBalanceVideoOperationHelper: Error processing video balance operation:',
      { error, telegramId, modelId }
    )
    let currentBalanceOnError = currentBalanceAtStart
    try {
      currentBalanceOnError = await getUserBalance(telegramId)
    } catch (getBalanceError) {
      logger.error('Failed to get balance in catch block (Helper)', {
        telegramId,
        getBalanceError,
      })
    }

    const errorMsg = isRu
      ? 'Внутренняя ошибка обработки операции.'
      : 'Internal error processing operation.'
    return {
      success: false,
      error: errorMsg + (error instanceof Error ? `: ${error.message}` : ''),
      newBalance: currentBalanceOnError,
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceOnError,
    }
  }
}
