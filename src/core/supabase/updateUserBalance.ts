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
 * Обновляет баланс пользователя, записывая соответствующую транзакцию в таблицу payments
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
}> => {
  try {
    // Проверяем, что ID пользователя указан
    if (!telegram_id) {
      logger.error('❌ Не указан ID пользователя', {
        description: 'User ID not specified',
        telegram_id,
      })
      return { success: false, newBalance: null }
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

    // Проверка на корректность суммы - должна быть положительным числом
    // или в случае корректировки баланса - новым значением баланса
    let operationAmount = amount

    // Обработка случая передачи нового баланса (для outcome) вместо суммы операции
    if (type === 'outcome' && amount > 100) {
      // Вероятно, передан новый баланс вместо суммы операции
      logger.warn(
        '⚠️ ⚠️ Не могу определить сумму операции, устанавливаю значение по умолчанию 5:',
        {
          description:
            'Cannot determine operation amount, setting default value of 5',
          telegram_id,
          original_amount: amount,
        }
      )

      operationAmount = 5 // Устанавливаем разумное значение по умолчанию для outcome-операции
    }

    // Получаем текущий баланс пользователя
    const currentBalance = await getUserBalance(telegram_id, bot_name)

    // Генерируем уникальный идентификатор для транзакции
    const inv_id = `${Date.now()}-${Math.floor(
      Math.random() * 1000000
    )}-${String(telegram_id).substring(0, 5)}`

    logger.info('💼 Создание новой записи о транзакции:', {
      description: 'Creating new transaction record',
      telegram_id,
      inv_id,
      transaction_amount: operationAmount,
      type,
    })

    // Создаем новую запись в таблице payments
    const { data, error } = await supabase
      .from('payments')
      .insert([
        {
          telegram_id,
          amount: operationAmount,
          stars: operationAmount,
          inv_id,
          type,
          status: 'COMPLETED',
          description: operation_description || `${type} operation`,
          metadata,
          payment_method,
          bot_name,
        },
      ])
      .select()

    if (error) {
      logger.error('❌ Ошибка при создании записи в payments:', {
        description: 'Error creating payment record',
        error: error.message,
        telegram_id,
        operationAmount,
        type,
        inv_id,
      })
      return { success: false, newBalance: null }
    }

    // Получаем обновленный баланс
    const newBalance = await getUserBalance(telegram_id, bot_name)

    logger.info('💰 Результат обновления баланса:', {
      description: 'Balance update result',
      telegram_id,
      operationAmount,
      type,
      inv_id,
      newBalance,
      payment_record: data && data.length > 0 ? data[0] : null,
    })

    return { success: true, newBalance }
  } catch (error) {
    logger.error('❌ Ошибка при обновлении баланса пользователя:', {
      description: 'Error updating user balance',
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return { success: false, newBalance: null }
  }
}
