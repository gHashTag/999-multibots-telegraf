import { inngest } from './clients'
import { logger } from '@/utils/logger'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'

export type TransactionType =
  | 'money_expense'
  | 'money_income'
  | 'subscription_purchase'
  | 'subscription_renewal'
  | 'refund'
  | 'bonus'
  | 'referral'
  | 'system'

export interface PaymentProcessEvent {
  data: {
    telegram_id: string
    amount: number // Всегда положительное число
    stars?: number // Всегда положительное число
    type: TransactionType
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
  async ({
    event,
    step,
  }: {
    event: { data: PaymentProcessEvent['data'] }
    step: any
  }) => {
    const { telegram_id, amount, type, description, bot_name, service_type } =
      event.data

    logger.info('🚀 Начало обработки платежа', {
      description: 'Starting payment processing',
      telegram_id,
      amount,
      type,
      bot_name,
      service_type,
    })

    try {
      // Проверяем баланс для списания
      if (type === 'money_expense') {
        const currentBalance = await step.run('check-balance', async () => {
          logger.info('💰 Проверка баланса', {
            description: 'Checking balance',
            telegram_id,
          })
          return getUserBalance(telegram_id)
        })

        logger.info('💰 Текущий баланс', {
          description: 'Current balance',
          telegram_id,
          balance: currentBalance,
          required_amount: amount,
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
          stars: amount,
          type,
          description,
          bot_name,
          service_type,
          payment_method: 'balance',
          status: 'COMPLETED',
        })
      })

      logger.info('✅ Платеж создан', {
        description: 'Payment created',
        payment_id: payment.payment_id,
        telegram_id,
        amount,
        type,
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
        return sendTransactionNotificationTest({
          telegram_id: Number(telegram_id),
          operationId,
          amount,
          currentBalance: 0,
          newBalance: 0,
          description,
          isRu: true,
          bot_name,
        })
      })

      logger.info('✅ Платеж успешно обработан', {
        description: 'Payment processed successfully',
        telegram_id,
        amount,
        type,
      })

      return { success: true, payment }
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
