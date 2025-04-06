import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { v4 as uuidv4 } from 'uuid'
/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event }) => {
    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      inv_id,
      service_type,
    } = event.data

    logger.info('🚀 Обработка платежа:', {
      description: 'Processing payment',
      telegram_id,
      amount,
      type,
      service_type,
    })

    try {
      // Получаем текущий баланс до транзакции
      const currentBalance = await getUserBalance(telegram_id, bot_name)

      // Создаем запись о платеже
      const { data: payment, error: paymentError } = await supabase
        .from('payments_v2')
        .upsert([
          {
            inv_id: inv_id || `${telegram_id}-${Date.now()}`,
            telegram_id,
            amount,
            stars: amount,
            type,
            description,
            bot_name,
            status: 'COMPLETED',
            payment_method: 'balance',
            currency: 'STARS',
            metadata: service_type ? { service_type } : undefined,
          },
        ])
        .select('*')
        .single()

      if (paymentError) {
        logger.error('❌ Ошибка при создании записи о платеже:', {
          description: 'Error creating payment record',
          error: paymentError.message,
          error_details: paymentError,
          telegram_id,
          type,
        })
        throw new Error('Payment creation failed')
      }

      // Обновляем баланс пользователя через add_stars_to_balance
      const {
        success,
        newBalance,
        error: balanceError,
      } = await updateUserBalance({
        telegram_id,
        amount,
        type: type as 'money_income' | 'money_expense',
        operation_description: description,
        bot_name,
        payment_method: 'balance',
        metadata: { payment_id: payment?.payment_id },
        service_type: service_type || 'default',
      })

      if (!success || balanceError) {
        logger.error('❌ Ошибка при обновлении баланса:', {
          description: 'Error updating balance',
          error: balanceError,
          telegram_id,
          type,
        })
        throw new Error('Balance update failed')
      }

      // Отправляем уведомление
      const operationId = uuidv4()
      await sendTransactionNotification({
        telegram_id: Number(telegram_id),
        operationId,
        amount,
        currentBalance: Number(currentBalance) || 0,
        newBalance: Number(newBalance) || 0,
        description: description || 'Платеж успешно обработан',
        isRu: true,
        bot_name,
      })

      logger.info('✅ Платеж успешно обработан:', {
        description: 'Payment processed successfully',
        payment_id: payment?.payment_id,
        telegram_id,
        amount,
        type,
        currentBalance,
        newBalance,
      })

      return payment
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : 'Unknown error',
        telegram_id,
        amount,
        type,
      })
      throw error
    }
  }
)
