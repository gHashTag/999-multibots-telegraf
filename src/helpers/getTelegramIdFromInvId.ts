import { TelegramId } from '@/interfaces/telegram.interface';
import { supabase } from '@/core/supabase'

type User = {
  telegram_id: TelegramId
  language_code: string
  first_name?: string
  last_name?: string
  username?: string
  balance?: number
  bot_name?: string
}

interface PaymentWithUser {
  telegram_id: TelegramId
  users: {
    first_name: string | null
    last_name: string | null
    username: string | null
    balance: number | null
    language_code: string
    bot_name: string | null
  }
}

export const getTelegramIdFromInvId = async (inv_id: string): Promise<User> => {
  try {
    const { data: rawData, error } = await supabase
      .from('payments_v2')
      .select(
        `
        telegram_id,
        users (
          first_name,
          last_name,
          username,
          balance,
          language_code,
          bot_name
        )
      `
      )
      .eq('inv_id', inv_id)
      .single()

    if (error) {
      console.error('Ошибка получения данных:', error)
      throw error
    }

    if (!rawData) {
      throw new Error('Данные не найдены')
    }

    const data: unknown = rawData
    const paymentData = data as PaymentWithUser

    // Проверяем, что данные пользователя существуют
    const { telegram_id, users } = paymentData
    if (!users) {
      throw new Error('Данные пользователя не найдены')
    }

    const {
      first_name,
      last_name,
      username,
      balance,
      bot_name,
      language_code,
    } = users

    return {
      telegram_id,
      language_code,
      first_name,
      last_name,
      username,
      balance,
      bot_name,
    }
  } catch (error) {
    console.error('Ошибка получения Telegram ID пользователя:', error)
    throw error
  }
}
