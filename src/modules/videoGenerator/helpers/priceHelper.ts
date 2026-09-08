import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult } from '@/interfaces'
import {
  getUnifiedModelConfig,
  getUnifiedModelPrice,
} from '@/config/unified-video-models.config' // ✅ UNIFIED CONFIG
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'

/**
 * Проверяет баланс пользователя без снятия денег (только проверка)
 */
export const checkBalanceVideoOperationHelper = async (
  telegramId: string,
  modelId: string,
  isRu: boolean,
  serviceType = 'image_to_video'
): Promise<BalanceOperationResult> => {
  if (!telegramId) {
    logger.error('checkBalanceVideoOperationHelper: User ID not found')
    return {
      success: false,
      error: 'User ID not found',
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  // ✅ Используем unified config
  let selectedModelConfig
  try {
    selectedModelConfig = getUnifiedModelConfig(modelId)
  } catch (error) {
    logger.error(
      'checkBalanceVideoOperationHelper: Invalid modelId received, model not found:',
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
    paymentAmount = getUnifiedModelPrice(modelId)
    modePrice = paymentAmount
  } catch (costError) {
    logger.error('checkBalanceVideoOperationHelper: Error calculating cost', {
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
    const currentBalance = await getUserBalance(telegramId)

    if (currentBalance < paymentAmount) {
      const message = isRu
        ? 'Недостаточно средств на балансе. Пополните — и продолжим.'
        : 'Insufficient funds. Top up and we continue.'
      logger.warn('checkBalanceVideoOperationHelper: Insufficient funds', {
        telegramId,
        currentBalance,
        paymentAmount,
        modelId,
      })
      return {
        // Tells the caller WHICH failure this is, so it can offer the button.
        insufficientFunds: true,
        success: false,
        error: message,
        newBalance: currentBalance,
        modePrice,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    logger.info('checkBalanceVideoOperationHelper: Balance check passed', {
      telegramId,
      currentBalance,
      paymentAmount,
      modelId,
    })

    return {
      success: true,
      newBalance: currentBalance, // Не меняем баланс, только проверяем
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance,
    }
  } catch (error) {
    logger.error('checkBalanceVideoOperationHelper: Error checking balance:', {
      error,
      telegramId,
      modelId,
    })
    let currentBalanceOnError = 0
    try {
      currentBalanceOnError = await getUserBalance(telegramId)
    } catch (getBalanceError) {
      logger.error('Failed to get balance in catch block', {
        telegramId,
        getBalanceError,
      })
    }

    const errorMsg = isRu
      ? 'Внутренняя ошибка проверки баланса.'
      : 'Internal error checking balance.'
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

/**
 * Снимает деньги после успешной генерации видео
 */
export const deductBalanceAfterSuccess = async (
  telegramId: string,
  modelId: string,
  botName: string,
  paymentAmount: number,
  serviceType = 'image_to_video'
): Promise<boolean> => {
  try {
    // ✅ Используем unified config
    const selectedModelConfig = getUnifiedModelConfig(modelId)
    if (!selectedModelConfig) {
      logger.error('deductBalanceAfterSuccess: Model config not found', {
        modelId,
      })
      return false
    }

    const updateSuccess = await updateUserBalance(
      telegramId,
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      `Video generation (${selectedModelConfig.name})`,
      {
        bot_name: botName,
        service_type: serviceType,
        model_name: modelId,
        modePrice: paymentAmount,
        currentBalance: 0, // Не знаем текущий баланс здесь
        paymentAmount: paymentAmount,
      }
    )

    if (updateSuccess) {
      logger.info('deductBalanceAfterSuccess: Payment deducted successfully', {
        telegramId,
        modelId,
        paymentAmount,
      })
      return true
    } else {
      logger.error('deductBalanceAfterSuccess: Failed to deduct payment', {
        telegramId,
        modelId,
        paymentAmount,
      })
      return false
    }
  } catch (error) {
    logger.error('deductBalanceAfterSuccess: Error deducting payment', {
      error,
      telegramId,
      modelId,
      paymentAmount,
    })
    return false
  }
}

/**
 * Обрабатывает операцию с балансом для видео (Изолированная версия) - УСТАРЕВШАЯ, используйте checkBalanceVideoOperationHelper + deductBalanceAfterSuccess
 */
export const processBalanceVideoOperationHelper = async (
  telegramId: string, // Removed ctx dependency
  modelId: string, // Changed configKey to modelId for clarity
  isRu: boolean,
  botName: string, // Added botName
  serviceType = 'image_to_video' // Исправляем дефис на подчеркивание
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

  // ✅ Используем unified config
  let selectedModelConfig
  try {
    selectedModelConfig = getUnifiedModelConfig(modelId)
  } catch (error) {
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
    // ✅ Рассчитываем цену через unified config
    paymentAmount = getUnifiedModelPrice(modelId)
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

  // Fail closed on a non-positive price. A 0 paymentAmount slips past the
  // `currentBalance < paymentAmount` check below (balance < 0 is always false)
  // and would charge 0 for a paid video (the 0-cost-bypass class). This mirrors
  // getUnifiedModelPrice's own "Fail CLOSED, not to 0" rule. No unified video
  // model is priced <= 0, so this refuses only an invalid/regressed price;
  // !(x > 0) also catches NaN.
  if (!(paymentAmount > 0)) {
    logger.error(
      'processBalanceVideoOperationHelper: non-positive price refused',
      { telegramId, modelId, paymentAmount }
    )
    return {
      success: false,
      error: isRu ? 'Ошибка расчета стоимости.' : 'Error calculating cost.',
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
        ? 'Недостаточно средств на балансе. Пополните — и продолжим.'
        : 'Insufficient funds. Top up and we continue.'
      logger.warn('processBalanceVideoOperationHelper: Insufficient funds', {
        telegramId,
        currentBalance: currentBalanceAtStart,
        paymentAmount,
        modelId,
      })
      return {
        // Tells the caller WHICH failure this is, so it can offer the button.
        insufficientFunds: true,
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
      `Video generation (${selectedModelConfig.name})`,
      {
        bot_name: botName, // Use passed botName
        service_type: serviceType, // Используем переданный serviceType вместо хардкода
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
