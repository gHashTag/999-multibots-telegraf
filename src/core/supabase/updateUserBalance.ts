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
  bot_name: string
  payment_method?: string
  service_type?: string
}

/**
 * Обновляет баланс пользователя через add_stars_to_balance
 * Записывает транзакцию в payments_v2 и обновляет баланс в users
 */
export const updateUserBalance = async ({
  telegram_id,
  amount,
  type,
  operation_description = '',
  metadata = {},
  bot_name,
  payment_method = 'System',
  service_type = 'default',
}: UpdateUserBalanceParams): Promise<{
  success: boolean
  newBalance: number | null
  error?: string
}> => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    if (!bot_name) {
      throw new Error('bot_name is required')
    }

    // Нормализуем telegram_id в BIGINT
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
      service_type,
    })

    // Вызываем add_stars_to_balance для обновления баланса
    const { data: result, error } = await supabase.rpc('add_stars_to_balance', {
      p_telegram_id: normalizedId,
      p_stars: type === 'money_expense' ? -Math.abs(amount) : Math.abs(amount),
      p_description: operation_description || 'Balance update',
      p_bot_name: bot_name,
      p_type: type,
      p_service_type: service_type,
    })

    if (error) {
      logger.error('❌ Ошибка при обновлении баланса:', {
        description: 'Error updating balance',
        error: error.message,
        error_details: error,
        telegram_id: normalizedId,
        amount,
        type,
        operation_description,
        metadata,
        bot_name,
        payment_method,
        service_type,
      })
      throw error
    }

    if (!result) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Payment processing error',
        error: 'No result returned from add_stars_to_balance',
        telegram_id: normalizedId,
        amount,
        type,
      })
      throw new Error('Payment processing failed')
    }

    const newBalance = result.new_balance

    logger.info('✅ Баланс успешно обновлен:', {
      description: 'Balance updated successfully',
      telegram_id: normalizedId,
      payment_id: result.payment_id,
      old_balance: result.old_balance,
      new_balance: newBalance,
      amount,
      type,
      operation_description,
      metadata,
      bot_name,
      payment_method,
      service_type,
    })

    return { success: true, newBalance }
  } catch (error) {
    logger.error('❌ Ошибка в updateUserBalance:', {
      description: 'Error in updateUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
      amount,
      type,
      operation_description,
      metadata,
      bot_name,
      payment_method,
      service_type,
    })
    return {
      success: false,
      newBalance: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
