import {
  type BalanceOperationResult,
  type MyContext,
} from '@/interfaces'
import { type TelegramId } from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'

import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'

type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

type BalanceOperationProps = {
  ctx: MyContext
  videoModel: VideoModelConfigKey
  telegram_id: TelegramId
  is_ru: boolean
}

export const processBalanceVideoOperation = async ({
  ctx,
  videoModel,
  telegram_id,
  is_ru,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(
      telegram_id,
      ctx.botInfo.username
    )
    if (currentBalance === null) {
      throw new Error('Balance not found')
    }

    const availableModelKeys = Object.keys(
      VIDEO_MODELS_CONFIG
    ) as VideoModelConfigKey[]

    // Проверка корректности модели
    if (!videoModel || !availableModelKeys.includes(videoModel)) {
      await ctx.telegram.sendMessage(
        ctx.from?.id?.toString() || '',
        is_ru
          ? 'Пожалуйста, выберите корректную модель'
          : 'Please choose a valid model'
      )
      return {
        newBalance: currentBalance,
        success: false,
        paymentAmount: 0,
        modePrice: 0,
        error: 'Invalid model',
        currentBalance: currentBalance,
      }
    }

    const modePrice = calculateFinalPrice(videoModel)

    // Проверка достаточности средств
    if (currentBalance < modePrice) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
      await ctx.telegram.sendMessage(ctx.from?.id?.toString() || '', message)
      return {
        newBalance: currentBalance,
        success: false,
        paymentAmount: 0,
        modePrice: modePrice,
        error: message,
        currentBalance: currentBalance,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = currentBalance - modePrice

    // Используем updateUserBalance
    const updateSuccess = await updateUserBalance(
      telegram_id.toString(),
      modePrice,
      PaymentType.MONEY_OUTCOME,
      `Video generation (${VIDEO_MODELS_CONFIG[videoModel].title})`,
      {
        bot_name: ctx.botInfo?.username,
        service_type: ctx.session.mode,
        model: videoModel,
        modePrice,
        currentBalance: currentBalance,
        paymentAmount: modePrice,
      }
    )

    if (!updateSuccess) {
      const message = is_ru
        ? 'Ошибка обновления баланса.'
        : 'Error updating balance.'
      logger.error('processBalanceVideoOperation: Failed to update balance', {
        telegram_id,
        videoModel,
      })
      return {
        success: false,
        error: message,
        newBalance: currentBalance,
        modePrice: modePrice,
        paymentAmount: 0,
        currentBalance: currentBalance,
      }
    }

    // Инвалидируем кэш после успешного обновления
    invalidateBalanceCache(telegram_id)

    return {
      newBalance,
      paymentAmount: modePrice,
      success: true,
      modePrice: modePrice,
      currentBalance: currentBalance,
    }
  } catch (error) {
    console.error('Error in processBalanceVideoOperation:', error)
    // Попытка получить баланс в блоке catch
    let currentBalanceOnError = 0
    try {
      const balance = await getUserBalance(telegram_id, ctx.botInfo.username)
      if (balance !== null) {
        currentBalanceOnError = balance
      }
    } catch (getBalanceError) {
      logger.error('Failed to get balance in catch block', { telegram_id, getBalanceError })
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      newBalance: currentBalanceOnError,
      modePrice: 0,
      paymentAmount: 0,
      currentBalance: currentBalanceOnError,
    }
  }
}
