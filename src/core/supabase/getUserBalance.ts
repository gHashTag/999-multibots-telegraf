import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from './index'
import { logger } from '@/utils/logger'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

/**
 * Получает баланс пользователя
 * @param telegram_id - ID пользователя в Telegram
 * @returns Баланс пользователя или null в случае ошибки
 */
export const getUserBalance = async (
  telegram_id: TelegramId
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
    })

    const { data: user, error } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', normalizedId)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении баланса:', {
        description: 'Error getting balance',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    if (!user) {
      logger.info('ℹ️ Пользователь не найден:', {
        description: 'User not found',
        telegram_id: normalizedId,
      })
      return 0 // Возвращаем 0 для новых пользователей
    }

    logger.info('✅ Баланс успешно получен:', {
      description: 'Balance retrieved successfully',
      telegram_id: normalizedId,
      balance: user.balance,
    })

    return user.balance
  } catch (error) {
    logger.error('❌ Ошибка в getUserBalance:', {
      description: 'Error in getUserBalance function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
