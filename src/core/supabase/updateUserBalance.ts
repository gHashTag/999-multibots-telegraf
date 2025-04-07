import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'

interface UpdateUserBalanceParams {
  telegram_id: string | number
  amount: number
  type: TransactionType
  description: string
  bot_name: string
  service_type?: string
  payment_method?: string
  metadata?: Record<string, any>
}

/**
 * Обновляет баланс пользователя и создает запись в таблице платежей
 */
export const updateUserBalance = async ({
  telegram_id,
  amount,
  type,
  description,
  bot_name,
  service_type = 'default',
  metadata = {},
}: UpdateUserBalanceParams): Promise<{
  success: boolean
  balance?: number
  error?: any
}> => {
  try {
    logger.info('💰 Обновление баланса пользователя:', {
      description: 'Updating user balance',
      telegram_id,
      amount,
      type,
      operation_description: description,
      metadata,
      bot_name,
      payment_method: 'balance',
      service_type,
    })

    // Нормализуем telegram_id к BIGINT
    const normalizedTelegramId = String(telegram_id)

    // Используем улучшенную функцию с проверкой баланса
    const { data, error } = await supabase.rpc(
      'add_stars_to_balance_with_check',
      {
        p_telegram_id: normalizedTelegramId,
        p_stars: amount,
        p_description: description,
        p_bot_name: bot_name,
        p_type: type,
        p_service_type: service_type,
      }
    )

    if (error) {
      logger.error('❌ Ошибка при обновлении баланса:', {
        description: 'Error updating balance',
        error: error.message,
        error_details: error,
        telegram_id,
        amount,
        type,
        operation_description: description,
        metadata,
        bot_name,
        payment_method: 'balance',
        service_type,
      })
      return { success: false, error }
    }

    // Проверяем результат выполнения функции
    if (!data.success) {
      logger.error('❌ Ошибка в add_stars_to_balance_with_check:', {
        description: 'Error from add_stars_to_balance_with_check',
        error: data.error,
        error_message: data.error_message,
        telegram_id,
        type,
        bot_name,
        user_id: data.user_id,
        old_balance: data.old_balance,
        requested_amount: data.requested_amount,
      })
      return {
        success: false,
        error: new Error(data.error_message || 'Недостаточно средств'),
        balance: data.old_balance,
      }
    }

    logger.info('✅ Баланс успешно обновлен:', {
      description: 'Balance updated successfully',
      telegram_id,
      payment_id: data.payment_id,
      old_balance: data.old_balance,
      new_balance: data.new_balance,
      amount,
      type,
      bot_name,
    })

    return { success: true, balance: data.new_balance }
  } catch (error) {
    logger.error('❌ Критическая ошибка при обновлении баланса:', {
      description: 'Critical error updating balance',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
      amount,
      type,
      bot_name,
    })
    return { success: false, error }
  }
}
