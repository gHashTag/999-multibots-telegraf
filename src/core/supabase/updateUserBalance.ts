import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'

interface UpdateUserBalanceParams {
  telegram_id: TelegramId
  amount: number
  type: 'money_income' | 'money_expense'
  operation_description?: string
  metadata?: Record<string, any>
  bot_name?: string
  payment_method?: string
  bot_name: string
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
}: UpdateUserBalanceParams): Promise<number | null> => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('💰 Обновление баланса пользователя:', {
      description: 'Updating user balance',
      telegram_id: normalizedId,
      amount,
      type,
      operation_description,
      metadata,
      bot_name,
      payment_method,
    })

    const { data: result, error } = await supabase.rpc('update_user_balance', {
      p_telegram_id: normalizedId,
      p_amount: amount,
    })

    if (error) {
      logger.error('❌ Ошибка при обновлении баланса:', {
        description: 'Error updating balance',
        error: error.message,
        telegram_id: normalizedId,
        amount,
        type,
        operation_description,
        metadata,
        bot_name,
        payment_method,
        operation_id,
        metadata: {
          ...metadata,
        },
      },
    })

    // Даем время на обработку события
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Получаем обновленный баланс
    const newBalance = await getUserBalance(telegram_id, bot_name)

    if (!newBalance) {
      logger.error('❌ Не удалось получить обновленный баланс:', {
        description: 'Failed to get updated balance',
        telegram_id,
      })
      throw error
    }

    logger.info('✅ Баланс успешно обновлен:', {
      description: 'Balance updated successfully',
      telegram_id: normalizedId,
      new_balance: result,
      type,
      operation_description,
      metadata,
      bot_name,
      payment_method,
    })

    return { success: true, newBalance: result }
  } catch (error) {
    logger.error('❌ Ошибка в updateUserBalance:', {
      description: 'Error in updateUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      type,
      operation_description,
      metadata,
      bot_name,
      payment_method,
    })
    return {
      success: false,
      newBalance: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
