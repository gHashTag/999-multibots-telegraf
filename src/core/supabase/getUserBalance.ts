import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя на основе транзакций в payments_v2
 * Вызывает SQL-функцию get_user_balance
 */
export const getUserBalance = async (
  telegram_id: TelegramId,
  bot_name?: string
): Promise<number> => {
  try {
    if (!telegram_id) {
      logger.warn('⚠️ Запрос баланса без telegram_id:', {
        description: 'Balance request without telegram_id',
        bot_name,
      })
      return 0
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение баланса пользователя:', {
      description: 'Getting user balance',
      telegram_id: normalizedId,
      bot_name,
    })

    // Получаем баланс из функции get_user_balance
    const { data: balance, error } = await supabase.rpc('get_user_balance', {
      user_telegram_id: normalizedId.toString(), // Важно передать в виде строки
    })

    if (error) {
      logger.error('❌ Ошибка получения баланса:', {
        description: 'Error getting balance',
        error: error.message,
        error_details: error,
        telegram_id: normalizedId,
      })
      return 0
    }

    logger.info('✅ Баланс пользователя получен:', {
      description: 'User balance retrieved',
      telegram_id: normalizedId,
      balance: balance || 0,
      bot_name,
    })

    return balance || 0
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      telegram_id,
    })
    return 0
  }
}
