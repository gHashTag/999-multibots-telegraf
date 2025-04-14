import { inngest } from '@/core/inngest'
import { ModeEnum, TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { directPaymentProcessor } from '@/core/supabase/directPayment'

/**
 * Функция для обработки платежей
 * Пытается использовать Inngest, но если он недоступен,
 * использует прямую обработку платежей через directPaymentProcessor
 *
 * @param telegramId - ID пользователя Telegram
 * @param amount - Сумма платежа
 * @param type - Тип транзакции (income, expense и т.д.)
 * @param description - Описание платежа
 * @param botName - Имя бота
 * @param serviceType - Тип сервиса
 * @returns Promise<boolean> - Результат операции
 */
export async function processPayment(
  telegramId: string,
  amount: number,
  type: TransactionType,
  description: string,
  botName: string,
  serviceType: ModeEnum
): Promise<boolean> {
  try {
    logger.info('🚀 Payment processing started', {
      telegramId,
      amount,
      type,
      description,
      botName,
      serviceType,
    })

    // Пытаемся обработать платеж через Inngest
    try {
      const { data, error } = await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: telegramId,
          amount: amount,
          type: type,
          description: description,
          bot_name: botName,
          service_type: serviceType,
        },
      })

      if (error) {
        logger.error(
          '❌ Error processing payment through Inngest, falling back to direct payment',
          {
            error,
            telegramId,
            amount,
            type,
          }
        )
        // Если Inngest вернул ошибку, переходим к прямой обработке (резервный вариант)
        throw new Error(
          'Inngest error: ' +
            (error instanceof Error ? error.message : JSON.stringify(error))
        )
      }

      logger.info('✅ Successful payment processing via Inngest', {
        telegramId,
        amount,
        type,
        data,
      })
      return true
    } catch (inngestError) {
      // Если Inngest недоступен или вернул ошибку, используем прямой метод обработки
      logger.warn(
        '⚠️ Inngest unavailable or returned error, using direct payment processing',
        {
          description: 'Falling back to direct payment processing',
          error:
            inngestError instanceof Error
              ? inngestError.message
              : String(inngestError),
          telegramId,
          amount,
          type,
        }
      )

      // Вызываем прямой обработчик платежей
      const directResult = await directPaymentProcessor({
        telegram_id: telegramId,
        amount,
        type,
        description,
        bot_name: botName,
        service_type: serviceType,
      })

      if (!directResult.success) {
        logger.error('❌ Direct payment processing failed', {
          error: directResult.error,
          telegramId,
          amount,
          type,
        })
        return false
      }

      logger.info(
        '✅ Successful direct payment processing (Inngest fallback)',
        {
          telegramId,
          amount,
          type,
          paymentId: directResult.payment?.payment_id,
        }
      )
      return true
    }
  } catch (error) {
    logger.error('❌ Critical error during payment processing', {
      error,
      telegramId,
      amount,
      type,
    })
    return false
  }
}

/**
 * Вспомогательная функция для списания средств
 *
 * @param telegramId - ID пользователя Telegram
 * @param amount - Сумма для списания (положительное число)
 * @param description - Описание операции
 * @param botName - Имя бота
 * @param serviceType - Тип сервиса
 * @returns Promise<boolean> - Результат операции
 */
export async function deductFunds(
  telegramId: string,
  amount: number,
  description: string,
  botName: string,
  serviceType: ModeEnum
): Promise<{ success: boolean; error?: string }> {
  try {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' }
    }

    const result = await processPayment(
      telegramId,
      amount,
      TransactionType.MONEY_EXPENSE,
      description,
      botName,
      serviceType
    )

    return { success: result }
  } catch (error) {
    logger.error('❌ Error during funds deduction', {
      error,
      telegramId,
      amount,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during funds deduction',
    }
  }
}

/**
 * Вспомогательная функция для пополнения баланса
 *
 * @param telegramId - ID пользователя Telegram
 * @param amount - Сумма для пополнения (положительное число)
 * @param description - Описание операции
 * @param botName - Имя бота
 * @returns Promise<boolean> - Результат операции
 */
export async function addFunds(
  telegramId: string,
  amount: number,
  description: string,
  botName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' }
    }

    const result = await processPayment(
      telegramId,
      amount,
      TransactionType.MONEY_INCOME,
      description,
      botName,
      ModeEnum.TopUpBalance
    )

    return { success: result }
  } catch (error) {
    logger.error('❌ Error during funds addition', {
      error,
      telegramId,
      amount,
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during funds addition',
    }
  }
}
