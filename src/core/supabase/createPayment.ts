import { supabase } from '.'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { TransactionType } from '@/interfaces/payments.interface'
interface PaymentData {
  telegram_id: string
  amount: number
  OutSum: string
  InvId: string
  inv_id: string
  currency: string
  stars: number
  status: string
  payment_method: string
  bot_name: string
  description: string
  metadata?: {
    payment_method: string
    email?: string
    subscription?: string
    stars?: number
  }
  language: string
  invoice_url: string
  subscription?: string
}

/**
 * Создает новый платеж в системе
 * Для Robokassa платежей всегда устанавливается валюта RUB
 */
export async function createPayment(data: PaymentData) {
  const normalizedTelegramId = normalizeTelegramId(data.telegram_id)

  // Проверяем способ оплаты и устанавливаем соответствующую валюту
  // Для Robokassa всегда используем RUB
  const paymentMethod =
    data.payment_method || data.metadata?.payment_method || 'system'
  const currency =
    paymentMethod === 'Robokassa' ? 'RUB' : data.currency || 'STARS'

  logger.info({
    message: '🔄 Создание платежа',
    description: 'Creating new payment',
    data: {
      telegram_id: normalizedTelegramId,
      amount: data.amount,
      stars: data.stars,
      currency,
      payment_method: paymentMethod,
      status: data.status,
    },
  })

  try {
    const { error } = await supabase.from('payments_v2').insert({
      telegram_id: normalizedTelegramId,
      amount: data.amount,
      stars: data.stars,
      currency: currency,
      description: data.description,
      metadata: {
        ...data.metadata,
        payment_method: paymentMethod,
      },
      bot_name: data.bot_name,
      status: data.status,
      invoice_url: data.invoice_url,
      type: TransactionType.MONEY_INCOME,
      inv_id: data.inv_id,
      operation_id: data.InvId || data.inv_id,
      language: data.language,
      payment_method: paymentMethod,
      payment_date: new Date(),
    })

    if (error) {
      logger.error({
        message: '❌ Ошибка при создании платежа',
        description: 'Error creating payment',
        error,
        data: {
          telegram_id: normalizedTelegramId,
          amount: data.amount,
        },
      })
      throw new Error(`Failed to create payment: ${error.message}`)
    }

    logger.info({
      message: '✅ Платеж успешно создан',
      description: 'Payment created successfully',
      telegram_id: normalizedTelegramId,
      amount: data.amount,
      stars: data.stars,
      currency,
      payment_method: paymentMethod,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при создании платежа',
      description: 'Error in createPayment function',
      error: error instanceof Error ? error.message : String(error),
      data: {
        telegram_id: normalizedTelegramId,
        amount: data.amount,
      },
    })
    throw error
  }
}
