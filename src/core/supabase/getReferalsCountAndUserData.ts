import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '@/core/supabase'
import { UserType } from '@/interfaces/supabase.interface'
import { getUserDetailsSubscription } from './subscriptions/getUserDetailsSubscription'

export const getReferalsCountAndUserData = async (
  telegram_id: string
): Promise<{
  count: number
  level: number
  subscriptionType: SubscriptionType
  userData: UserType | null
  isExist: boolean
}> => {
  let subscriptionInfo: { type: SubscriptionType | null; isActive: boolean } = {
    type: null,
    isActive: false,
  }

  //
  try {
    // Сначала получаем UUID пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegram_id.toString())
      .single()

    if (userError || !userData) {
      console.error(
        'getReferalsCountAndUserData: Ошибка при получении user_id или пользователя не существует:',
        userError
      )
      return {
        count: 0,
        level: 0,
        subscriptionType: SubscriptionType.STARS,
        userData: null,
        isExist: false,
      }
    }

    // Получаем актуальную информацию о подписке
    try {
      // Вызываем функцию для получения сырых данных
      const rawSubscriptionInfo = await getUserDetailsSubscription(telegram_id)
      // Преобразуем строковый тип в Enum
      let mappedType: SubscriptionType = SubscriptionType.STARS // По умолчанию STARS
      if (
        rawSubscriptionInfo.subscriptionType === SubscriptionType.NEUROPHOTO
      ) {
        mappedType = SubscriptionType.NEUROPHOTO
      } else if (
        rawSubscriptionInfo.subscriptionType === SubscriptionType.NEUROBASE
      ) {
        mappedType = SubscriptionType.NEUROBASE
      } // Добавить другие типы при необходимости

      subscriptionInfo = {
        type: mappedType,
        isActive: rawSubscriptionInfo.isSubscriptionActive,
      }
    } catch (subError) {
      console.error(
        `getReferalsCountAndUserData: Ошибка при вызове getUserDetailsSubscription для ${telegram_id}:`,
        subError
      )
      // Продолжаем выполнение, но используем дефолтную подписку STARS
      subscriptionInfo = { type: SubscriptionType.STARS, isActive: false }
    }

    // Теперь ищем рефералов по UUID
    const { data, error: countError } = await supabase
      .from('users')
      .select('inviter', { count: 'exact', head: true })
      .eq('inviter', userData.user_id)

    if (countError) {
      console.error('Ошибка при получении количества рефералов:', countError)
      // Возвращаем данные пользователя и подписку, но 0 рефералов
      return {
        count: 0,
        level: userData.level || 0,
        subscriptionType: subscriptionInfo.type || SubscriptionType.STARS,
        userData: userData as UserType,
        isExist: true,
      }
    }

    return {
      count: data?.length || 0,
      level: userData.level || 0,
      subscriptionType: subscriptionInfo.type || SubscriptionType.STARS,
      userData: userData as UserType,
      isExist: true,
    }
  } catch (error) {
    console.error('Непредвиденная ошибка в getReferalsCountAndUserData:', error)
    return {
      count: 0,
      level: 0,
      subscriptionType: SubscriptionType.STARS,
      userData: null,
      isExist: false,
    }
  }
}
