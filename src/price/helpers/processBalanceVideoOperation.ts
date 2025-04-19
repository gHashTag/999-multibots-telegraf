import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import {
  BalanceOperationResult,
  MyContext,
  VideoModelConfig,
  VideoModel,
} from '@/interfaces'
import { calculateModeCost } from './modelsCost'
import { VIDEO_MODELS } from '@/interfaces/cost.interface'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

/**
 * Обрабатывает операцию с балансом для видео
 */
export const processBalanceVideoOperation = async (
  ctx: MyContext,
  videoModelName: VideoModel,
  isRu: boolean
): Promise<BalanceOperationResult> => {
  const telegram_id = ctx.from?.id
  const currentBalanceAtStart = 0 // Инициализация

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

  // Расчет стоимости - предполагаем, что это image_to_video?
  const { stars: modePrice } = calculateModeCost({
    mode: ModeEnum.ImageToVideo,
  })
  const paymentAmount = modePrice // Используем modePrice как сумму списания

  try {
    const currentBalance = await getUserBalance(telegram_id.toString()) // Добавлено .toString()

    if (currentBalance < paymentAmount) {
      const message = isRu
        ? 'Недостаточно средств на балансе. Пополните баланс командой /buy.'
        : 'Insufficient funds. Top up your balance using the /buy command.'
      await ctx.reply(message)
      logger.warn('processBalanceVideoOperation: Insufficient funds', {
        telegram_id,
        currentBalance,
        paymentAmount,
      })
      return {
        success: false,
        error: message,
        newBalance: currentBalance,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    const newBalance = Number(currentBalance) - Number(paymentAmount)

    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      paymentAmount,
      'money_outcome',
      `Video generation (${selectedModel.title})`,
      {
        // Добавляем метаданные
        bot_name: ctx.botInfo?.username,
        service_type: ctx.session.mode,
        model: videoModelName,
        modePrice: paymentAmount,
        currentBalance: currentBalance,
        paymentAmount: paymentAmount, // Добавил для ясности
      }
    )

    if (!updateSuccess) {
      const message = isRu
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      logger.error('processBalanceVideoOperation: Failed to update balance', {
        telegram_id,
      })
      return {
        success: false,
        error: message,
        newBalance: currentBalance,
        modePrice: paymentAmount,
        paymentAmount: paymentAmount,
        currentBalance,
      }
    }

    logger.info('processBalanceVideoOperation: Balance updated successfully', {
      telegram_id,
      newBalance,
    })
    return {
      success: true,
      newBalance,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance,
    }
  } catch (error) {
    logger.error(
      'processBalanceVideoOperation: Error processing video balance operation:',
      { error, telegram_id }
    )
    const currentBalanceOnError = await getUserBalance(telegram_id.toString()) // Попытка получить актуальный баланс
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      newBalance: currentBalanceOnError,
      modePrice: paymentAmount,
      paymentAmount: paymentAmount,
      currentBalance: currentBalanceOnError,
    }
  }
}
