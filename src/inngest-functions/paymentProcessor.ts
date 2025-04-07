import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'

import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'
import { TelegramId } from '@/interfaces/telegram.interface'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { supabase } from '@/core/supabase'

export interface PaymentProcessEvent {
  data: {
    telegram_id: string
    amount: number // Теперь всегда положительное число
    stars?: number // Теперь всегда положительное число
    type: string
    description: string
    bot_name: string
    inv_id?: string
    metadata?: any
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
    try {
      const {
        telegram_id,
        amount,
        type,
        description,
        bot_name,
        inv_id,
        metadata,
      } = event.data
      const stars = event.data.stars ?? amount

      logger.info('🚀 Обработка платежа:', {
        description: 'Processing payment',
        telegram_id,
        amount,
        stars,
        type,
        bot_name,
        inv_id: inv_id,
      })

      // Проверяем существует ли пользователь
      const userExists = await step.run('check-user-exists', async () => {
        const user = await getUserByTelegramId(telegram_id, bot_name)
        if (!user) {
          logger.info('👤 Пользователь не найден, будет создан:', {
            description: 'User not found, will be created',
            telegram_id,
            bot_name,
          })
        } else {
          logger.info('👤 Найден пользователь:', {
            description: 'User found',
            telegram_id,
            user_id: user.id,
            bot_name,
          })
        }
        return !!user
      })

      // Получаем текущий баланс пользователя
      const currentBalance = await step.run('get-user-balance', async () => {
        const balance = await getUserBalance(telegram_id, bot_name)

        logger.info('💰 Текущий баланс пользователя:', {
          description: 'Current user balance',
          telegram_id,
          currentBalance: balance,
          bot_name,
        })

        return balance
      })

      // Проверка достаточности средств при списании
      if (type === 'money_expense' && currentBalance < Math.abs(amount)) {
        logger.error('❌ Недостаточно средств для списания:', {
          description: 'Insufficient funds for deduction',
          telegram_id,
          currentBalance,
          requestedAmount: amount,
          bot_name,
        })

        throw new Error('Insufficient funds')
      }

      // Проверяем существующий платеж
      if (inv_id) {
        const existingPayment = await step.run(
          'check-existing-payment',
          async () => {
            return await getPaymentByInvId(inv_id)
          }
        )

        if (existingPayment) {
          logger.info('⚠️ Платеж уже обработан:', {
            description: 'Payment already processed',
            payment_id: existingPayment.payment_id,
            inv_id: inv_id,
          })
          return { success: false, error: 'Payment already exists' }
        }
      }

      // Создаем платеж (всегда с положительными значениями)
      const payment = await step.run('create-payment', async () => {
        return await createSuccessfulPayment({
          telegram_id: telegram_id,
          amount: Math.abs(amount), // Гарантируем положительное значение
          stars: Math.abs(stars), // Гарантируем положительное значение
          type, // money_income или money_expense определяет прибавление или вычитание
          description,
          bot_name,
          inv_id,
          metadata,
          payment_method: 'balance',
          status: 'COMPLETED',
        })
      })

      // Обновляем баланс пользователя - сейчас этот шаг не создает новых записей
      // Он нужен только чтобы получить актуальный баланс после транзакции
      const balanceUpdate = await step.run('update-user-balance', async () => {
        try {
          logger.info('🔄 Получение обновленного баланса:', {
            description: 'Getting updated balance',
            telegram_id,
            payment_id: payment.payment_id,
            amount,
            type,
            bot_name,
          })

          // Получаем новый баланс после создания платежа
          const { data: newBalance, error: balanceError } = await supabase.rpc(
            'get_user_balance',
            {
              user_telegram_id: String(telegram_id),
            }
          )

          if (balanceError) {
            throw balanceError
          }

          // Обновляем дату последнего платежа пользователя
          await supabase
            .from('users')
            .update({
              last_payment_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('telegram_id', String(telegram_id))

          return {
            success: true,
            oldBalance: currentBalance,
            newBalance,
          }
        } catch (error) {
          logger.error('❌ Ошибка при обновлении баланса:', {
            description: 'Error updating balance',
            error: error instanceof Error ? error.message : String(error),
            telegram_id,
            type,
            bot_name,
            user_id: userExists ? 'exists' : 'new',
            current_db_balance: currentBalance,
            attempted_amount_change: amount,
          })
          throw error
        }
      })

      // Отправляем уведомление пользователю о транзакции
      await step.run('send-notification', async () => {
        try {
          // Генерируем уникальный ID операции
          const operationId = inv_id || uuidv4()

          // Отправляем уведомление о транзакции
          await sendTransactionNotification({
            telegram_id: Number(telegram_id),
            operationId,
            amount,
            currentBalance: Number(currentBalance) || 0,
            newBalance: Number(balanceUpdate.newBalance) || 0,
            description: description || 'Платеж успешно обработан',
            isRu: true,
            bot_name,
          })

          logger.info('📨 Уведомление о транзакции отправлено:', {
            description: 'Transaction notification sent',
            telegram_id,
            operation_id: operationId,
            amount,
            old_balance: currentBalance,
            new_balance: balanceUpdate.newBalance,
            bot_name,
          })

          return { success: true, operationId }
        } catch (error) {
          logger.error('⚠️ Ошибка при отправке уведомления:', {
            description: 'Error sending notification',
            error: error instanceof Error ? error.message : String(error),
            telegram_id,
            amount,
            type,
            bot_name,
          })

          // Не прерываем выполнение, если уведомление не отправлено
          return { success: false, error: String(error) }
        }
      })

      // Формируем результат обработки платежа
      return {
        success: true,
        telegram_id,
        amount,
        type,
        payment_id: payment.payment_id,
        old_balance: balanceUpdate.oldBalance,
        new_balance: balanceUpdate.newBalance,
        operation_id: inv_id,
        bot_name,
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        telegram_id: event.data.telegram_id,
        amount: event.data.amount,
        type: event.data.type,
        bot_name: event.data.bot_name,
      })
      throw error
    }
  }
)
