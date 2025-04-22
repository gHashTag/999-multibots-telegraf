import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { BalanceOperationResult, MyContext, VideoModel } from '@/interfaces'
import { calculateModeCost } from './modelsCost'
import { VIDEO_MODELS } from '@/interfaces/cost.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { sendBalanceMessage } from '@/price/helpers/sendBalanceMessage'

// Экспортируем VIDEO_MODELS, чтобы его можно было импортировать в тестах
export { VIDEO_MODELS }

/**
 * Обрабатывает операцию с балансом для видео
 */
export const processBalanceVideoOperation = async (
  ctx: MyContext,
  videoModelName: VideoModel,
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

  const selectedModel = VIDEO_MODELS.find(m => m.name === videoModelName)

  if (!selectedModel) {
    logger.error(
      'processBalanceVideoOperation: Invalid video model selected:',
      { videoModelName }
    )
    return {
      success: false,
      error: 'Invalid model',
      newBalance: 0,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: 0,
    }
  }

  let paymentAmount = 0
  let modePrice = 0
  try {
    const costResult = calculateModeCost({ mode: ModeEnum.ImageToVideo })
    paymentAmount = costResult.stars
    modePrice = paymentAmount
    if (paymentAmount <= 0) {
      throw new Error('Calculated payment amount is zero or negative.')
    }
  } catch (costError) {
    logger.error('processBalanceVideoOperation: Error calculating cost', {
      videoModelName,
      error: costError,
    })
    return {
      success: false,
      error: 'Error calculating cost',
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
      await ctx.reply(message)
      logger.warn('processBalanceVideoOperation: Insufficient funds', {
        telegram_id,
        currentBalance: currentBalanceAtStart,
        paymentAmount,
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

    const amountToUpdate = -paymentAmount

    const newBalanceResult = await updateUserBalance(
      telegram_id.toString(),
      amountToUpdate
    )

    if (newBalanceResult === null) {
      const message = isRu
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      logger.error('processBalanceVideoOperation: Failed to update balance', {
        telegram_id,
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
      newBalance: newBalanceResult,
    })
    return {
      success: true,
      newBalance: newBalanceResult,
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceAtStart,
    }
  } catch (error) {
    logger.error(
      'processBalanceVideoOperation: Error processing video balance operation:',
      { error, telegram_id }
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

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      newBalance: currentBalanceOnError,
      modePrice,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceOnError,
    }
  }
}
