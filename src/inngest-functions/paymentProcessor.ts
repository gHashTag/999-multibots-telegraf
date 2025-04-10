import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'

import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { v4 as uuidv4 } from 'uuid'

import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/types/modes'

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
    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      stars,
    } = event.data

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
      if (type === 'money_expense') {
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
          inv_id: event.data.inv_id,
          metadata: event.data.metadata,
        })
      })

      // Обновляем баланс пользователя
      await step.run('update-balance', async () => {
        logger.info('💰 Обновление баланса', {
          description: 'Updating balance',
          telegram_id,
          type,
          amount,
        })

        const updateQuery = supabase
          .from('users')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('telegram_id', telegram_id)
          .eq('bot_name', bot_name)

        const { error } = await updateQuery

        if (error) {
          throw new Error(`Ошибка обновления баланса: ${error.message}`)
        }
      })

      // Получаем новый баланс
      const newBalance = await step.run('get-new-balance', async () => {
        return getUserBalance(telegram_id)
      })

      // Отправляем уведомление
      await step.run('send-notification', async () => {
        const operationId = uuidv4()
        logger.info('📨 Отправка уведомления', {
          description: 'Sending notification',
          telegram_id,
          amount,
          operationId,
        })

        if (service_type !== ModeEnum.VoiceToText) {
          return sendTransactionNotification({
            telegram_id: Number(telegram_id),
            operationId,
            amount,
            currentBalance,
            newBalance,
            description,
            isRu: true,
            bot_name,
          })
        }
      })

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
