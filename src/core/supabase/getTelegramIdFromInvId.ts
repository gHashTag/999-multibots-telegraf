import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

type User = {
  telegram_id: TelegramId
  language_code: string
  first_name?: string
  last_name?: string
  username?: string
  bot_name?: string
}

interface PaymentWithUser {
  telegram_id: TelegramId
  users: {
    first_name: string | null
    last_name: string | null
    username: string | null
    language_code: string
    bot_name: string | null
  }
}

export const getTelegramIdFromInvId = async (inv_id: string): Promise<User> => {
  try {
    logger.info({
      message: '🔍 Поиск пользователя по inv_id',
      inv_id,
    })

    const { data: rawData, error } = await supabase
      .from('payments_v2')
      .select(
        `
        telegram_id,
        users (
          first_name,
          last_name,
          username,
          language_code,
          bot_name
        )
      `
      )
      .eq('inv_id', inv_id)
      .single()

    if (error) {
      logger.error({
        message: '❌ Ошибка получения данных',
        error: error.message,
        inv_id,
      })
      throw error
    }

    if (!rawData) {
      logger.error({
        message: '❌ Данные не найдены',
        inv_id,
      })
      throw new Error('Данные не найдены')
    }

    const data: unknown = rawData
    const paymentData = data as PaymentWithUser

    // Проверяем, что данные пользователя существуют
    const { telegram_id, users } = paymentData
    if (!users) {
      logger.error({
        message: '❌ Данные пользователя не найдены',
        inv_id,
        telegram_id,
      })
      throw new Error('Данные пользователя не найдены')
    }

    const { first_name, last_name, username, bot_name, language_code } = users

    // Преобразуем null в undefined
    return {
      telegram_id,
      language_code,
      first_name: first_name || undefined,
      last_name: last_name || undefined,
      username: username || undefined,
      bot_name: bot_name || undefined,
    }
  } catch (err) {
    const error = err as Error
    logger.error({
      message: '❌ Ошибка получения Telegram ID пользователя',
      error: error.message,
      stack: error.stack,
      inv_id,
    })
    throw error
  }
}
