import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { calculateFinalPrice } from './calculateFinalPrice'

import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'

/**
 * Обрабатывает операцию с балансом для видео
 */
export const processBalanceVideoOperation = async (
  ctx: MyContext,
  configKey: keyof typeof VIDEO_MODELS_CONFIG, // Принимаем НАПРЯМУЮ ключ конфигурации
  isRu: boolean
): Promise<BalanceOperationResult> => {
  const telegram_id = ctx.from?.id
  let currentBalanceAtStart = 0

  if (!telegram_id) {
    logger.error('processBalanceVideoOperation: User ID not found')
    return {
      success: false,
      error: 'User ID not found',
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  logger.info('Processing video balance operation for config key:', {
    configKey,
  })

  // Ищем конфигурацию по ключу
  const selectedModelConfig = VIDEO_MODELS_CONFIG[configKey]

  if (!selectedModelConfig) {
    logger.error(
      'processBalanceVideoOperation: Invalid config key received, model not found in VIDEO_MODELS_CONFIG:',
      { configKey }
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
    // Рассчитываем цену, передавая КЛЮЧ КОНФИГА
    paymentAmount = calculateFinalPrice(configKey)
    modePrice = paymentAmount
  } catch (costError) {
    logger.error('processBalanceVideoOperation: Error calculating cost', {
      configKey,
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
    currentBalanceAtStart = await getUserBalance(telegram_id.toString())

    if (currentBalanceAtStart < paymentAmount) {
      const message = isRu
        ? 'Недостаточно средств на балансе. Пополните баланс командой /buy.'
        : 'Insufficient funds. Top up your balance using the /buy command.'
      logger.warn('processBalanceVideoOperation: Insufficient funds', {
        telegram_id,
        currentBalance: currentBalanceAtStart,
        paymentAmount,
        configKey,
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

    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      paymentAmount,
      PaymentType.MONEY_OUTCOME,
      `Video generation (${selectedModelConfig.title})`,
      {
        bot_name: ctx.botInfo?.username,
        service_type: ctx.session.mode,
        model: configKey, // В метаданные записываем КЛЮЧ КОНФИГУРАЦИИ
        modePrice,
        currentBalance: currentBalanceAtStart,
        paymentAmount: paymentAmount,
      }
    )

    if (!updateSuccess) {
      const message = isRu
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      logger.error('processBalanceVideoOperation: Failed to update balance', {
        telegram_id,
        configKey,
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

    logger.info('processBalanceVideoOperation: Balance updated successfully', {
      telegram_id,
      newBalance,
      paymentAmount,
      configKey,
    })
    return {
      success: true,
      newBalance,
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceAtStart,
    }
  } catch (error) {
    logger.error(
      'processBalanceVideoOperation: Error processing video balance operation:',
      { error, telegram_id, configKey }
    )
    let currentBalanceOnError = currentBalanceAtStart
    try {
      currentBalanceOnError = await getUserBalance(telegram_id.toString())
    } catch (getBalanceError) {
      logger.error('Failed to get balance in catch block', {
        telegram_id,
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
