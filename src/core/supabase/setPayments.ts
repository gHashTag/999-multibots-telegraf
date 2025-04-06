import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

export interface Payment {
  payment_id?: number // Optional because it's auto-generated
  telegram_id: string
  amount: number
  stars: number
  currency: string
  description: string
  metadata: any
  payment_method: string
  bot_name: string
  inv_id: string
  status: string
  email?: string
  subscription?: string
  language?: string
  invoice_url?: string
  payment_date?: Date
  OutSum?: string
  InvId?: string
  type?: 'money_income' | 'money_expense'
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
    const amount = OutSum ? parseFloat(OutSum) : 0

    logger.info('🔍 Создание нового платежа:', {
      description: 'Creating new payment',
      telegram_id,
      amount,
      status,
    })

    const { data, error } = await supabase.from('payments_v2').insert({
      telegram_id,
      amount,
      inv_id: InvId || `${Date.now()}-${telegram_id}`,
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
      type: amount > 0 ? 'money_income' : 'money_expense',
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
      amount,
      status,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в setPayments:', {
      description: 'Error in setPayments function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: normalizeTelegramId(telegram_id),
    })
    throw error
  }
}

export interface CreatePaymentParams {
  telegram_id: number
  amount: number
  stars: number
  currency: string
  description: string
  metadata: any
  payment_method: string
  bot_name: string
  inv_id: string
  status: string
  type?: 'money_income' | 'money_expense'
}

export const createPayment = async (
  params: CreatePaymentParams
): Promise<Payment | null> => {
  try {
    const normalizedParams = {
      ...params,
      telegram_id: normalizeTelegramId(params.telegram_id),
      type:
        params.type || (params.amount > 0 ? 'money_income' : 'money_expense'),
    }

    logger.info('🚀 Создание записи о платеже:', {
      description: 'Creating payment record',
      telegram_id: normalizedParams.telegram_id,
      amount: normalizedParams.amount,
      stars: normalizedParams.stars,
      currency: normalizedParams.currency,
    })

    const { data: payments, error } = await supabase
      .from('payments_v2')
      .insert(normalizedParams)
      .select(
        'payment_id, telegram_id, amount, stars, currency, description, metadata, payment_method, bot_name, inv_id, status'
      )
      .limit(1)

    if (error) {
      logger.error('❌ Ошибка при создании записи о платеже:', {
        description: 'Error creating payment record',
        error: error.message,
        error_details: error,
        params: normalizedParams,
        telegram_id: normalizedParams.telegram_id,
      })
      return null
    }

    const payment = payments?.[0]
    if (!payment) {
      logger.error('❌ Платеж не был создан:', {
        description: 'Payment was not created',
        params: normalizedParams,
        telegram_id: normalizedParams.telegram_id,
      })
      return null
    }

    logger.info('✅ Запись о платеже создана:', {
      description: 'Payment record created',
      payment_id: payment.payment_id,
      telegram_id: normalizedParams.telegram_id,
    })

    return payment
  } catch (error) {
    logger.error('❌ Ошибка при создании записи о платеже:', {
      description: 'Error creating payment record',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
    })
    return null
  }
}
