import type { TelegramId } from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase'
import type { MyContext } from '@/interfaces'
import { BalanceOperationResult } from '@/interfaces/payments.interface'

import { calculateFinalPrice } from '@/price/helpers'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'

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
      }
    }

    // Рассчитываем новый баланс
    const newBalance = currentBalance - modePrice

    return {
      newBalance,
      paymentAmount: modePrice,
      success: true,
      modePrice: modePrice,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    throw error
  }
}
