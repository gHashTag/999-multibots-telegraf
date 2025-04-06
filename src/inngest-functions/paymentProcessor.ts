import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { getUserBalance } from '@/core/supabase'
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
    const { telegram_id, amount, type, description, bot_name, inv_id } =
      event.data

    logger.info('🚀 Обработка платежа:', {
      description: 'Processing payment',
      telegram_id,
      amount,
      type,
    })

    try {
      // Получаем текущий баланс до транзакции
      const currentBalance = await getUserBalance(telegram_id, bot_name)

      const { data: payment, error } = await supabase
        .from('payments_v2')
        .upsert([
          {
            inv_id,
            telegram_id,
            amount,
            stars: amount,
            type,
            description,
            bot_name,
            status: 'COMPLETED',
            payment_method: 'balance',
            currency: 'STARS',
          },
        ])
        .select('*')
        .single()

      if (error) {
        console.error('❌ ❌ Ошибка при создании записи о платеже:', {
          description: 'Error creating payment record',
          error: error.message,
          error_details: error,
          telegram_id,
        })
        throw new Error('Payment creation failed')
      }

      // Получаем новый баланс после транзакции
      const newBalance = await getUserBalance(telegram_id, bot_name)
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
