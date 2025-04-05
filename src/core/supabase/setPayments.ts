import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '@/core/supabase'
import { Subscription } from '../../interfaces/supabase.interface'
import { PaymentStatus } from './updatePaymentStatus'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

type PaymentMethod = 'Robokassa' | 'YooMoney' | 'Telegram' | 'Stripe' | 'Other'
type Currency = 'RUB' | 'USD' | 'EUR' | 'STARS'

export interface Payment {
  telegram_id: TelegramId
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
    const normalizedTelegramId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Создание нового платежа:', {
      description: 'Creating new payment',
      telegram_id: normalizedTelegramId,
      amount: parseFloat(OutSum),
      status,
    })

    const { data, error } = await supabase.from('payments_v2').insert({
      telegram_id: normalizedTelegramId,
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
        telegram_id: normalizedTelegramId,
      })
      throw error
    }

    logger.info('✅ Платеж успешно создан', {
      description: 'Payment created successfully',
      telegram_id: normalizedTelegramId,
      amount: parseFloat(OutSum),
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
  telegram_id: TelegramId
  amount: number
  stars: number
  currency?: string
  description?: string
  metadata?: Record<string, any>
  payment_method?: string
  bot_name?: string
  inv_id?: string
  status?: string
}

export const createPayment = async ({
  telegram_id,
  amount,
  stars,
  currency = 'STARS',
  description = 'Payment operation',
  metadata = {},
  payment_method = 'balance',
  bot_name,
  inv_id = `${Date.now()}-${telegram_id}`,
  status = 'PENDING',
}: CreatePaymentParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('💰 Создание новой записи о платеже:', {
      description: 'Creating new payment record',
      telegram_id: normalizedId,
      amount,
      stars,
      currency,
      payment_method,
      bot_name,
      inv_id,
      status,
    })

    const { data, error } = await supabase
      .from('payments_v2')
      .insert([
        {
          telegram_id: normalizedId,
          payment_date: new Date(),
          amount,
          stars,
          currency,
          description,
          metadata,
          payment_method,
          bot_name,
          inv_id,
          status,
        },
      ])
      .select()

    if (error) {
      logger.error('❌ Ошибка при создании платежа:', {
        description: 'Error creating payment record',
        error: error.message,
        telegram_id: normalizedId,
        amount,
        stars,
        inv_id,
      })
      throw error
    }

    logger.info('✅ Платеж успешно создан:', {
      description: 'Payment record created successfully',
      telegram_id: normalizedId,
      payment_record: data && data.length > 0 ? data[0] : null,
    })

    return data && data.length > 0 ? data[0] : null
  } catch (error) {
    logger.error('❌ Ошибка в createPayment:', {
      description: 'Error in createPayment function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
