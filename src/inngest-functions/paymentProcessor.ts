import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'

/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    const { telegram_id, amount, type, description, bot_name, inv_id, stars } =
      event.data

    logger.info('🚀 Обработка платежа:', {
      description: 'Processing payment',
      telegram_id,
      amount,
      type,
    })

    try {
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

      logger.info('✅ Платеж успешно обработан:', {
        description: 'Payment processed successfully',
        payment_id: payment?.payment_id,
        telegram_id,
        amount,
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
