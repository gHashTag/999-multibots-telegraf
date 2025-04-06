import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { ModeEnum } from '@/interfaces/modes.interface'

interface CreatePendingPaymentParams {
  telegram_id: string | number
  amount: number
  stars: number
  inv_id: string
  description: string
  bot_name: string
  email?: string
  language?: string
  invoice_url: string
  metadata?: Record<string, any>
}

/**
 * Создает новый платеж со статусом PENDING в системе
 */
export async function createPendingPayment(
  params: CreatePendingPaymentParams
): Promise<{ success: boolean }> {
  const normalizedTelegramId = normalizeTelegramId(params.telegram_id)

  logger.info({
    message: '🔄 Создание платежа в статусе PENDING',
    description: 'Creating new PENDING payment',
    params: {
      ...params,
      telegram_id: normalizedTelegramId,
    },
  })

  try {
    const { error } = await supabase.from('payments_v2').insert({
      telegram_id: normalizedTelegramId,
      amount: params.amount,
      stars: params.stars,
      currency: 'RUB',
      description: params.description,
      metadata: {
        ...params.metadata,
        payment_method: 'Robokassa',
        email: params.email,
      },
      bot_name: params.bot_name,
      status: 'PENDING',
      email: params.email,
      invoice_url: params.invoice_url,
      type: 'money_income',
      service_type: ModeEnum.NeuroPhoto,
      inv_id: params.inv_id,
      operation_id: params.inv_id,
      language: params.language || 'ru',
      payment_method: 'Robokassa',
    })

    if (error) {
      logger.error({
        message: '❌ Ошибка при создании платежа',
        description: 'Error creating pending payment',
        error,
        params: {
          telegram_id: normalizedTelegramId,
          amount: params.amount,
          stars: params.stars,
        },
      })
      throw error
    }

    logger.info({
      message: '✅ Платеж успешно создан',
      description: 'Pending payment created successfully',
      telegram_id: normalizedTelegramId,
      amount: params.amount,
      stars: params.stars,
    })

    return { success: true }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при создании платежа',
      description: 'Error in createPendingPayment function',
      error: error instanceof Error ? error.message : String(error),
      params: {
        telegram_id: normalizedTelegramId,
        amount: params.amount,
      },
    })
    throw error
  }
}
