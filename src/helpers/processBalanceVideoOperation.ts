import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { BalanceOperationResult } from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { calculateVideoFinalPrice } from '@/helpers'
import { VIDEO_MODELS_CONFIG } from '@/helpers/VIDEO_MODELS'
import { ModeEnum } from '@/price/helpers'
// Функция для расчета окончательной стоимости модели

type BalanceOperationProps = {
  videoModel: string
  telegram_id: string
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
  description: string
}

export const processBalanceVideoOperation = async ({
  videoModel,
  telegram_id,
  is_ru,
  bot,
  bot_name,
  description,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id)

    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]

    if (!modelConfig) {
      await bot.telegram.sendMessage(
        telegram_id,
        is_ru ? 'Неверная модель' : 'Invalid model'
      )
      return {
        newBalance: currentBalance,
        paymentAmount: 0,
        success: false,
        error: 'Invalid model',
      }
    }

    const paymentAmount = calculateVideoFinalPrice(modelConfig.id)

    // Проверка достаточности средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
        : 'Insufficient funds. Top up your balance by calling the /buy command.'
      await bot.telegram.sendMessage(telegram_id, message)
      return {
        newBalance: currentBalance,
        paymentAmount,
        success: false,
        error: message,
      }
    }

    // Рассчитываем новый баланс

    // Обновление баланса через централизованную платежную систему
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: telegram_id,
        amount: paymentAmount,
        type: 'money_expense',
        description: description,
        bot_name: bot_name,
        service_type: ModeEnum.ImageToVideo, // Исправлен enum согласно документации
      },
    })

    return {
      newBalance: currentBalance - paymentAmount,
      paymentAmount,
      success: true,
    }
  } catch (error) {
    console.error('Error processing video operation:', error)
    throw error
  }
}
