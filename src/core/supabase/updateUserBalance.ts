import { supabase } from './index'
import { logger } from '@/utils/logger'
import { getUserBalance } from './getUserBalance'

interface UpdateUserBalanceParams {
  telegram_id: string | number
  amount: number
  type: 'income' | 'outcome'
  operation_description?: string
  metadata?: Record<string, any>
  bot_name?: string
  payment_method?: string
}

/**
 * Обновляет баланс пользователя, записывая соответствующую транзакцию в таблицу payments_v2
 * И возвращает актуальный баланс пользователя
 */
export const updateUserBalance = async ({
  telegram_id,
  amount,
  type,
  operation_description = '',
  metadata = {},
  bot_name,
  payment_method = 'System',
}: UpdateUserBalanceParams): Promise<{
  success: boolean
  newBalance: number | null
  error?: string
}> => {
  try {
    // Проверяем, что ID пользователя указан
    if (!telegram_id) {
      const error = '❌ Не указан ID пользователя'
      logger.error(error, {
        description: 'User ID not specified',
        telegram_id,
      })
      return { success: false, newBalance: null, error }
    }

    // Логирование входных данных для диагностики
    logger.info('🔍 Входные данные updateUserBalance:', {
      log_description: 'Input parameters for updateUserBalance',
      telegram_id,
      amount,
      amount_type: typeof amount,
      type,
      operation_description,
      metadata: JSON.stringify(metadata),
    })

    // Валидация суммы
    if (isNaN(amount) || amount <= 0) {
      const error = '❌ Некорректная сумма операции'
      logger.error(error, {
        description: 'Invalid operation amount',
        telegram_id,
        amount,
        type,
      })
      return { success: false, newBalance: null, error }
    }

    // Проверяем достаточность средств для outcome-операций
    if (type === 'outcome') {
      const currentBalance = await getUserBalance(telegram_id, bot_name)
      if (currentBalance === null || currentBalance < amount) {
        const error = '❌ Недостаточно средств'
        logger.error(error, {
          description: 'Insufficient funds',
          telegram_id,
          current_balance: currentBalance,
          required_amount: amount,
          type,
        })
        return { success: false, newBalance: null, error }
      }
    }

    // Генерируем уникальный идентификатор для транзакции
    const inv_id = `${Date.now()}-${Math.floor(
      Math.random() * 1000000
    )}-${String(telegram_id).substring(0, 5)}`

    logger.info('💼 Создание новой записи о транзакции:', {
      description: 'Creating new transaction record',
      telegram_id,
      inv_id,
      transaction_amount: amount,
      type,
    })

    // Определяем тип операции и валюту на основе метаданных
    const currency = metadata?.currency || 'STARS'
    const payment_type = metadata?.payment_type || 'regular'

    // Создаем новую запись в таблице payments_v2
    const { data, error } = await supabase
      .from('payments_v2')
      .insert([
        {
          telegram_id,
          payment_date: new Date(),
          operation_type: type,
          status: 'COMPLETED',
          stars_amount: currency === 'STARS' ? amount : null,
          money_amount: currency === 'RUB' ? amount : null,
          currency,
          description: operation_description || `${type} operation`,
          metadata,
          payment_method,
          bot_name,
          inv_id,
          payment_type,
        },
      ])
      .select()

    if (error) {
      const errorMessage = '❌ Ошибка при создании записи в payments_v2'
      logger.error(errorMessage, {
        description: 'Error creating payment record',
        error: error.message,
        telegram_id,
        amount,
        type,
        inv_id,
      })
      return { success: false, newBalance: null, error: errorMessage }
    }

    // Получаем обновленный баланс
    const newBalance = await getUserBalance(telegram_id, bot_name)

    logger.info('💰 Результат обновления баланса:', {
      description: 'Balance update result',
      telegram_id,
      amount,
      type,
      inv_id,
      newBalance,
      payment_record: data && data.length > 0 ? data[0] : null,
    })

    return { success: true, newBalance }
  } catch (error) {
    const errorMessage = '❌ Ошибка при обновлении баланса пользователя'
    logger.error(errorMessage, {
      description: 'Error updating user balance',
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return { success: false, newBalance: null, error: errorMessage }
  }
}
