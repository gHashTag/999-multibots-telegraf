import { getUserBalance } from '@/core/supabase/balance/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import {
  PaymentType,
  BalanceOperationResult,
} from '@/interfaces/payments.interface'
import { Telegraf } from 'telegraf' // Нужен для отправки сообщения о недостатке средств
import { MyContext } from '@/interfaces'
import logger from '@/utils/logger'
import { ModeEnum } from '@/interfaces'

// Определим тип для результата, аналогичный BalanceOperationResult, но без ctx-зависимых полей
export interface ServiceBalanceOperationResult {
  newBalance?: number
  success: boolean
  error?: string
  paymentAmount: number
  currentBalance: number
}

// Тип для параметров
interface ServiceBalanceOperationProps {
  telegram_id: string // Принимаем как string
  paymentAmount: number
  is_ru: boolean
  bot: Telegraf<MyContext> // Нужен для отправки сообщения об ошибке
  bot_name: string
  description: string
  service_type: ModeEnum // Use ModeEnum as specified
}

export const processServiceBalanceOperation = async ({
  telegram_id,
  paymentAmount,
  is_ru,
  bot,
  bot_name,
  description,
  service_type,
}: ServiceBalanceOperationProps): Promise<ServiceBalanceOperationResult> => {
  let currentBalance = 0
  try {
    // Получаем текущий баланс (getUserBalance принимает string)
    currentBalance = await getUserBalance(telegram_id)

    // Проверяем достаточно ли средств
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? '❌ Недостаточно звёзд. Пополните баланс через /buy.'
        : '❌ Insufficient stars. Top up your balance via /buy.'
      // Отправляем сообщение напрямую через bot.telegram
      try {
        await bot.telegram.sendMessage(telegram_id, message)
      } catch (e) {
        logger.error('Failed to send insufficient balance message', {
          telegram_id,
          error: e,
        })
      }
      // Возвращаем результат с ошибкой
      return {
        currentBalance,
        success: false,
        error: message,
        paymentAmount,
      }
    }

    // Рассчитываем новый баланс
    const newBalance = currentBalance - paymentAmount

    // Используем существующую updateUserBalance
    const updateSuccess = await updateUserBalance(
      telegram_id,
      -paymentAmount, // Pass negative amount for expense
      PaymentType.MONEY_OUTCOME, // Correctly use the Enum member
      description,
      {
        // Передаем остальные данные в metadata
        bot_name,
        service_type,
        paymentAmount: paymentAmount, // Дублируем для логики внутри updateUserBalance
        currentBalance: currentBalance, // Передаем текущий баланс для логов
        operation: 'service_payment', // Добавляем маркер операции
      }
    )

    if (!updateSuccess) {
      const message = is_ru
        ? '❌ Ошибка обновления баланса.'
        : '❌ Error updating balance.'
      logger.error(
        'Failed to update balance in processServiceBalanceOperation',
        { telegram_id, paymentAmount }
      )
      // Отправляем сообщение об ошибке напрямую
      try {
        await bot.telegram.sendMessage(telegram_id, message)
      } catch (e) {
        logger.error('Failed to send balance update error message', {
          telegram_id,
          error: e,
        })
      }
      return {
        currentBalance, // Возвращаем баланс до попытки списания
        success: false,
        error: 'Failed to update balance', // Возвращаем общую ошибку
        paymentAmount,
      }
    }

    // Успешное списание
    return {
      newBalance, // Новый баланс после списания
      success: true,
      paymentAmount,
      currentBalance, // Баланс до списания
    }
  } catch (error) {
    logger.error('Critical Error in processServiceBalanceOperation:', {
      telegram_id,
      paymentAmount,
      error,
    })
    // Пытаемся получить баланс еще раз в случае неизвестной ошибки
    try {
      currentBalance = await getUserBalance(telegram_id)
    } catch (e) {
      logger.error(
        'Failed to get balance in final catch block of processServiceBalanceOperation',
        { telegram_id, error: e }
      )
      currentBalance = 0 // или другое значение по умолчанию
    }
    return {
      currentBalance,
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown balance processing error',
      paymentAmount,
    }
  }
}
