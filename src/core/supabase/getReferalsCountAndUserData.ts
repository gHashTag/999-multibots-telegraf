import { TelegramId } from '@/types/telegram.interface'
import { Subscription } from '@/types/supabase.interface'
import { supabase } from '.'
import { UserType } from '@/types/supabase.interface'
import { logger } from '@/utils/logger'

interface ReferralsResponse {
  count: number
  level: number
  subscription?: Subscription
  userData: UserType | null
  isExist: boolean
}

export const getReferalsCountAndUserData = async (
  telegram_id: TelegramId
): Promise<ReferralsResponse> => {
  try {
    // Сначала получаем UUID пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (userError || !userData) {
      logger.error('❌ Ошибка при получении user_id:', {
        description: 'Error getting user data',
        error: userError?.message,
        telegram_id,
      })
      return {
        count: 0,
        level: 0,
        userData: null,
        isExist: false,
      }
    }

    // Теперь ищем рефералов по UUID
    const { data, error } = await supabase
      .from('users')
      .select('inviter')
      .eq('inviter', userData.user_id)

    if (error) {
      logger.error('❌ Ошибка при получении рефералов:', {
        description: 'Error getting referrals',
        error: error.message,
        telegram_id,
        user_id: userData.user_id,
      })
      return {
        count: 0,
        level: 0,
        userData: null,
        isExist: false,
      }
    }

    return {
      count: data?.length || 0,
      level: userData.level || 0,
      subscription: userData.subscription as Subscription,
      userData: userData as UserType,
      isExist: true,
    }
  } catch (err) {
    const error = err as Error
    logger.error('❌ Ошибка в getReferalsCountAndUserData:', {
      description: 'Unexpected error in getReferalsCountAndUserData',
      error: error.message,
      telegram_id,
    })
    return {
      count: 0,
      level: 0,
      userData: null,
      isExist: false,
    }
  }
}
