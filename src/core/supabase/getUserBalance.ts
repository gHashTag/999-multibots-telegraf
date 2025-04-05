import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'

/**
 * Получает баланс пользователя
 * @param telegram_id - ID пользователя в Telegram
 * @param bot_name - Имя бота (опционально)
 * @returns Баланс пользователя или null в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: TelegramId,
  bot_name?: string
): Promise<number | null> => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение баланса пользователя:', {
      description: 'Getting user balance',
      telegram_id: normalizedId,
      bot_name,
    })

    let query = supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', normalizedId)

    // Если указан bot_name, добавляем его в условие
    if (bot_name) {
      query = query.eq('bot_name', bot_name)
    }

    const { data: user, error } = await query.single()

    if (error) {
      logger.error('❌ Ошибка при получении баланса:', {
        description: 'Error getting balance',
        error: error.message,
        telegram_id: normalizedId,
        bot_name,
      })
      throw error
    }

    if (!user) {
      logger.info('ℹ️ Пользователь не найден:', {
        description: 'User not found',
        telegram_id: normalizedId,
        bot_name,
      })
      return 0 // Возвращаем 0 для новых пользователей
    }

    logger.info('✅ Баланс успешно получен:', {
      description: 'Balance retrieved successfully',
      telegram_id: normalizedId,
      balance: user.balance,
      bot_name,
    })

    return user.balance
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      bot_name,
    })
    throw error
  }
}
