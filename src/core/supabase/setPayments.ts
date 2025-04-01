import { supabase } from '@/core/supabase'
import { Subscription } from '../../interfaces/supabase.interface'
import { PaymentStatus } from './updatePaymentStatus'
import { logger } from '@/utils/logger'

type PaymentMethod = 'Robokassa' | 'YooMoney' | 'Telegram' | 'Stripe' | 'Other'
type Currency = 'RUB' | 'USD' | 'EUR' | 'STARS'

export interface Payment {
  telegram_id: string
  OutSum: string
  InvId: string
  currency: Currency
  stars: number
  email: string
  status: PaymentStatus
  payment_method: PaymentMethod
  subscription: Subscription
  bot_name: string
  language: string
  invoice_url?: string
}

/**
 * 💰 Создает новый платеж в базе данных
 * @param payment - Данные платежа
 */
export const setPayments = async ({
  telegram_id,
  OutSum,
  InvId,
  currency,
  stars,
  email,
  status,
  payment_method,
  subscription,
  bot_name,
  language,
  invoice_url,
}: Payment) => {
  try {
    const { data, error } = await supabase.from('payments').insert({
      telegram_id,
      amount: parseFloat(OutSum),
      inv_id: InvId,
      currency,
      status,
      payment_method,
      description: `Purchase and sale:: ${stars}`,
      stars,
      email,
      subscription,
      bot_name,
      language,
      invoice_url,
    })

    if (error) {
      logger.error('❌ Ошибка создания платежа:', {
        description: 'Error creating payment',
        error: error.message,
        telegram_id,
      })
      throw error
    }

    logger.info('✅ Платеж успешно создан', {
      description: 'Payment created successfully',
      telegram_id,
      amount: parseFloat(OutSum),
      status,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в setPayments:', {
      description: 'Error in setPayments function',
      error: error.message,
      telegram_id,
    })
    throw error
  }
}
