import { supabase } from './index'
import { logger } from '@/utils/logger'

type PaymentService =
  | 'NeuroPhoto'
  | 'Text to speech'
  | 'Image to video'
  | 'Training'
  | 'Refund'
  | 'System'
  | 'Telegram'

type BalanceUpdateMetadata = {
  stars?: number
  payment_method?: PaymentService
  bot_name?: string
  language?: string
  service_type?: PaymentService
  [key: string]: any
}

/**
 * Создает запись о транзакции в таблице payments
 * @returns Promise<boolean> - успешно ли выполнено добавление записи
 */
export const updateUserBalance = async (
  telegram_id: string,
  amount: number,
  type: 'income' | 'outcome',
  description?: string,
  metadata?: BalanceUpdateMetadata
): Promise<boolean> => {
  try {
    // Проверка входных данных
    if (!telegram_id) {
      logger.error('❌ Пустой telegram_id в updateUserBalance:', {
        description: 'Empty telegram_id in updateUserBalance',
        telegram_id,
      })
      return false
    }

    // Проверка корректности суммы операции
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      logger.error('❌ Некорректная сумма операции:', {
        description: 'Invalid operation amount',
        amount,
        telegram_id,
      })
      return false
    }

    // Безопасно преобразуем amount в число
    let safeAmount = Number(amount)

    // Дополнительная защита: если после преобразования получили NaN, устанавливаем 0
    if (isNaN(safeAmount)) {
      logger.warn(
        '⚠️ После преобразования получили NaN, устанавливаем сумму в 0',
        {
          description: 'Got NaN after conversion, setting amount to 0',
          telegram_id,
          original_value: amount,
        }
      )
      safeAmount = 0
    }

    logger.info('💰 Создание записи о транзакции:', {
      description: 'Creating transaction record',
      telegram_id,
      amount: safeAmount,
      type,
      bot_name: metadata?.bot_name || 'system',
    })

    // Проверяем существование пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegram_id)
      .single()

    if (userError) {
      logger.error('❌ Пользователь не найден при создании транзакции:', {
        description: 'User not found during transaction creation',
        telegram_id,
        error: userError.message,
      })
      return false
    }

    if (!userData) {
      logger.error('❌ Пользователь не найден (нет данных):', {
        description: 'User not found (no data)',
        telegram_id,
      })
      return false
    }

    // Более надежный способ генерации ID
    const invId = `${Date.now()}-${Math.floor(
      Math.random() * 1000000
    )}-${telegram_id.substring(0, 5)}`

    logger.info('💼 Создание записи о транзакции:', {
      description: 'Creating transaction record',
      telegram_id,
      inv_id: invId,
      amount: Math.abs(safeAmount),
      type,
    })

    // Создаем запись о транзакции
    const { error: paymentError } = await supabase.from('payments').insert({
      telegram_id,
      inv_id: invId,
      currency: 'STARS',
      amount: parseFloat(Math.abs(safeAmount).toFixed(2)),
      status: 'COMPLETED',
      stars: parseFloat(Math.abs(safeAmount).toFixed(2)) || 0,
      type,
      description: description || `Balance ${type}`,
      payment_method: metadata?.payment_method,
      bot_name: metadata?.bot_name || 'neuro_blogger_bot',
      language: metadata?.language || 'ru',
    })

    if (paymentError) {
      logger.error('❌ Ошибка при создании записи о транзакции:', {
        description: 'Error creating transaction record',
        telegram_id,
        error: paymentError.message,
      })
      return false
    }

    logger.info('✅ Транзакция успешно создана:', {
      description: 'Transaction successfully created',
      telegram_id,
      amount: safeAmount,
      type,
    })

    return true
  } catch (error) {
    logger.error('❌ Неожиданная ошибка при создании транзакции:', {
      description: 'Unexpected error creating transaction',
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Возвращаем false вместо выброса исключения
    return false
  }
}
