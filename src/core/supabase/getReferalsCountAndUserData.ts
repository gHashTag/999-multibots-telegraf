import { Subscription } from '@/interfaces/supabase.interface'
import { supabase } from '.'
import { UserType } from '@/interfaces/supabase.interface'

export const getReferalsCountAndUserData = async (
  telegram_id: string
): Promise<{
  count: number
  level: number
  subscription?: Subscription
  userData: UserType
  isExist: boolean
}> => {
  try {
    // Сначала получаем UUID пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (userError || !userData) {
      console.error(
        'getReferalsCountAndUserData: Ошибка при получении user_id:',
        userError
      )
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
      console.error('Ошибка при получении рефералов:', error)
      return {
        count: 0,
        level: 0,
        userData: null,
        isExist: false,
      }
    }

    return {
      count: data?.length || 0,
      level: userData.level,
      subscription: userData.subscription,
      userData: userData as UserType,
      isExist: true,
    }
  } catch (error) {
    console.error('Ошибка в getReferalsCountAndUserData:', error)
    return {
      count: 0,
      level: 0,
      userData: null,
      isExist: false,
    }
  }
}
