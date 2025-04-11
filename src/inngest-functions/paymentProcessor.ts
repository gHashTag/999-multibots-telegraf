import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'

import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { normalizeTransactionType } from '@/interfaces/payments.interface'
import { isDev } from '@/config'

export interface PaymentProcessEvent {
  data: {
    telegram_id: string
    amount: number // Всегда положительное число
    stars?: number // Всегда положительное число
    type: string
    description: string
    bot_name: string
    inv_id?: string
    metadata?: any
    service_type: ModeEnum // Используем ModeEnum для типизации
  }
}

/**
 * Централизованный процессор платежей через Inngest
 * Выполняет все операции с балансом пользователя
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: 'payment-processor',
    name: 'Payment Processor',
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    const validatedParams = event.data

    // Нормализуем тип транзакции в нижний регистр
    if (validatedParams.type) {
      validatedParams.type = normalizeTransactionType(validatedParams.type)
    }

    if (!validatedParams) {
      throw new Error('🚫 Не переданы параметры')
    }

    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      stars,
    } = validatedParams

    logger.info('🚀 Начало обработки платежа', {
      description: 'Starting payment processing',
      telegram_id,
      amount,
      type,
      bot_name,
      service_type,
    })

    try {
      // Проверяем, что amount положительное
      if (amount <= 0) {
        throw new Error(
          `Некорректная сумма платежа: ${amount}. Сумма должна быть положительной.`
        )
      }

      // Проверяем, что stars положительное, если указано
      if (stars !== undefined && stars <= 0) {
        throw new Error(
          `Некорректное количество звезд: ${stars}. Количество должно быть положительным.`
        )
      }

      // Получаем текущий баланс
      const currentBalance = await step.run('get-balance', async () => {
        logger.info('💰 Получение текущего баланса', {
          description: 'Getting current balance',
          telegram_id,
        })
        return getUserBalance(telegram_id)
      })

      // Проверяем баланс для списания
      if (type === TransactionType.MONEY_EXPENSE) {
        logger.info('💰 Проверка баланса для списания', {
          description: 'Checking balance for expense',
          telegram_id,
          currentBalance,
          amount,
        })

        if (currentBalance < amount) {
          throw new Error(
            `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
          )
        }
      }

      // Создаем запись о платеже
      const payment = await step.run('create-payment', async () => {
        logger.info('💳 Создание записи о платеже', {
          description: 'Creating payment record',
          telegram_id,
          amount,
          type,
        })

        return createSuccessfulPayment({
          telegram_id,
          amount,
          stars: stars || amount,
          type,
          description,
          bot_name,
          service_type,
          payment_method: 'balance',
          status: 'COMPLETED',
          inv_id: validatedParams.inv_id,
          metadata: validatedParams.metadata,
        })
      })

      // Инвалидируем кэш баланса и получаем новый баланс
      const newBalance = await step.run('get-new-balance', async () => {
        // Сначала инвалидируем кэш баланса, чтобы получить свежие данные
        logger.info('🔄 Инвалидация кэша баланса:', {
          description: 'Invalidating balance cache',
          telegram_id,
        })
        invalidateBalanceCache(telegram_id)

        // Теперь получаем обновленный баланс
        return getUserBalance(telegram_id)
      })

      // Отправляем уведомление только если это не локальное окружение
      if (!isDev) {
        await step.run('send-notification', async () => {
          const operationId = uuidv4()
          logger.info('📨 Отправка уведомления', {
            description: 'Sending notification',
            telegram_id,
            amount,
            operationId,
          })

          return sendTransactionNotificationTest({
            telegram_id: Number(telegram_id),
            operationId,
            amount,
            currentBalance,
            newBalance,
            description,
            isRu: true,
            bot_name,
          })
        })
      } else {
        logger.info('📨 Уведомление в локальном окружении пропущено', {
          description: 'Notification skipped in dev environment',
          telegram_id,
          amount,
          currentBalance,
          newBalance,
        })
      }

      logger.info('✅ Платеж успешно обработан', {
        description: 'Payment processed successfully',
        telegram_id,
        amount,
        type,
        currentBalance,
        newBalance,
      })

      return {
        success: true,
        payment,
        balanceChange: {
          before: currentBalance,
          after: newBalance,
          difference: newBalance - currentBalance,
        },
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа', {
        description: 'Error processing payment',
        telegram_id,
        amount,
        type,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
)
