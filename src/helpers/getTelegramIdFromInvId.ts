import { supabase } from '@/core/supabase'
import { Logger as logger } from '@/utils/logger'

export interface User {
  telegram_id: string
  language_code?: string
  first_name?: string
  last_name?: string
  username?: string
  bot_name: string
}

export const getTelegramIdFromInvId = async (inv_id: string): Promise<User> => {
  try {
    logger.info('🔍 Поиск платежа по inv_id', {
      description: 'Searching payment by inv_id',
      inv_id,
    })

    // Получаем платеж по inv_id
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .select('telegram_id')
      .eq('inv_id', inv_id)
      .single()

    if (paymentError || !payment) {
      logger.error('❌ Платеж не найден', {
        description: 'Payment not found',
        inv_id,
        error: paymentError?.message,
      })
      throw new Error('Payment not found')
    }

    logger.info('✅ Платеж найден', {
      description: 'Payment found',
      inv_id,
      telegram_id: payment.telegram_id,
    })

    // Получаем данные пользователя по telegram_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', payment.telegram_id)
      .single()

    if (userError || !user) {
      logger.error('❌ Пользователь не найден', {
        description: 'User not found',
        telegram_id: payment.telegram_id,
        error: userError?.message,
      })
      throw new Error('User not found')
    }

    logger.info('✅ Пользователь найден', {
      description: 'User found',
      telegram_id: user.telegram_id,
    })

    return user
  } catch (error) {
    logger.error('❌ Ошибка получения данных пользователя', {
      description: 'Error getting user data',
      inv_id,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
