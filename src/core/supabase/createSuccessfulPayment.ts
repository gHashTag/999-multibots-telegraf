import { TelegramId } from '@/interfaces/telegram.interface'
import { TransactionType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '@/supabase'
import { getUserByTelegramId } from './getUserByTelegramId'
import { normalizeTransactionType } from '@/utils/service.utils'
import { logger } from '@/utils/logger'

interface CreateSuccessfulPaymentParams {
  telegram_id: TelegramId
  amount: number
  type: TransactionType | string
  description: string
  bot_name: string
  service_type?: string
  payment_method?: string
  metadata?: Record<string, any>
  subscription?: SubscriptionType
  inv_id: string
  stars?: number
  status?: string
  currency?: string
  invoice_url?: string
}

/**
 * Создает успешный платеж в системе
 * @param params Параметры платежа
 * @returns Результат создания платежа
 */
export async function createSuccessfulPayment({
  telegram_id,
  amount,
  type,
  description,
  service_type,
  stars,
  payment_method = 'Telegram',
  bot_name,
  metadata,
  status = 'COMPLETED',
  inv_id,
  currency = 'XTR',
  invoice_url,
  subscription,
}: CreateSuccessfulPaymentParams) {
  try {
    // Если передан inv_id, проверяем, не существует ли уже платеж с таким ID
    if (inv_id) {
      const { data: existingPayment } = await supabase
        .from('payments_v2')
        .select('id, inv_id')
        .eq('inv_id', inv_id)
        .maybeSingle()

      if (existingPayment) {
        logger.info('🔄 [ДУБЛИКАТ]: Обнаружен платеж с тем же inv_id:', {
          description:
            'Attempt to create payment with existing inv_id (duplicate prevented)',
          inv_id,
          existing_payment_id: existingPayment.id,
        })

        // Возвращаем найденный платеж, чтобы избежать дублирования
        const { data: paymentData } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('id', existingPayment.id)
          .single()

        logger.info(
          '✅ Возвращаем существующий платеж вместо создания дубликата:',
          {
            description:
              'Returning existing payment instead of creating duplicate',
            payment_id: existingPayment.id,
            inv_id,
          }
        )

        return paymentData
      }
    }

    // Получаем пользователя для проверки
    const user = await getUserByTelegramId(telegram_id)
    if (!user) {
      throw new Error(`User not found for telegram_id: ${telegram_id}`)
    }

    // Создаем копию параметров для модификации
    const params = {
      telegram_id,
      amount,
      type,
      description,
      service_type,
      stars,
      payment_method,
      bot_name,
      metadata,
      status,
      inv_id,
      currency,
      invoice_url,
      subscription,
    }

    // Нормализуем тип транзакции в нижний регистр для совместимости с БД
    params.type = normalizeTransactionType(type as TransactionType)

    // Нормализуем telegram_id к строке
    const telegramIdStr = String(telegram_id)

    const numericStars = stars !== undefined ? Number(stars) : amount

    const { data, error } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: telegramIdStr,
        amount,
        stars: numericStars,
        payment_method,
        description,
        type: params.type,
        service_type,
        bot_name,
        status,
        metadata,
        currency,
        inv_id,
        invoice_url,
        subscription,
      })
      .select()
      .single()

    if (error) {
      // Для дублирования inv_id
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        logger.info('🔄 [ДУБЛИКАТ]: Предотвращено дублирование платежа:', {
          description:
            'Duplicate payment prevented (unique constraint violation)',
          error: error instanceof Error ? error.message : String(error),
          code: error.code,
          details: 'details' in error ? error.details : 'Unknown details',
        })
      }
      // Для несуществующего пользователя
      else if (
        error instanceof Error &&
        error.message.includes('User not found')
      ) {
        logger.info('👤 [ПРОВЕРКА]: Пользователь не найден:', {
          description: 'User not found check (expected in some test cases)',
          error: error.message,
        })
      }
      // Для всех других ошибок
      else {
        logger.error('❌ Ошибка при создании записи о платеже:', {
          description: 'Error creating payment record',
          error: error instanceof Error ? error.message : String(error),
          error_details: error,
          telegram_id,
          amount,
          type,
          bot_name,
        })
      }
      throw error
    }

    logger.info('✅ Запись о платеже успешно создана:', {
      description: 'Payment record created successfully',
      payment_id: data.id,
      telegram_id,
      amount,
      type: params.type,
      bot_name,
    })

    return data
  } catch (error) {
    // Для дублирования inv_id
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      logger.info('🔄 [ДУБЛИКАТ]: Предотвращено дублирование платежа:', {
        description:
          'Duplicate payment prevented (unique constraint violation)',
        error: error instanceof Error ? error.message : String(error),
        code: error.code,
        details: 'details' in error ? error.details : 'Unknown details',
      })
    }
    // Для несуществующего пользователя
    else if (
      error instanceof Error &&
      error.message.includes('User not found')
    ) {
      logger.info('👤 [ПРОВЕРКА]: Пользователь не найден:', {
        description: 'User not found check (expected in some test cases)',
        error: error.message,
      })
    }
    // Для всех других ошибок
    else {
      logger.error('❌ Ошибка в createSuccessfulPayment:', {
        description: 'Error in createSuccessfulPayment function',
        error: error instanceof Error ? error.message : String(error),
        error_details: error,
      })
    }
    throw error
  }
}
