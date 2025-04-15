import { supabase } from '@/supabase'
import { UserSubscription } from '@/interfaces/subscription.interface'

/**
 * Получает информацию о подписке пользователя по его Telegram ID
 *
 * @param telegramId ID пользователя в Telegram
 * @returns Информация о подписке или null, если подписки нет
 */
export async function getUserSub(
  telegramId: string
): Promise<UserSubscription | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Ошибка "Результат не содержит строк", значит подписки нет
        return null
      }

      console.error('Error getting user subscription:', error)
      throw error
    }

    if (!data) {
      return null
    }

    // Преобразуем строки дат в объекты Date
    const subscription: UserSubscription = {
      ...data,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
      canceled_at: data.canceled_at ? new Date(data.canceled_at) : null,
    }

    return subscription
  } catch (error) {
    console.error('Error in getUserSub:', error)
    return null
  }
}

/**
 * Проверяет, есть ли у пользователя активная подписка
 *
 * @param telegramId ID пользователя в Telegram
 * @returns true, если подписка активна, иначе false
 */
export async function hasActiveSubscription(
  telegramId: string
): Promise<boolean> {
  const subscription = await getUserSub(telegramId)
  return !!subscription && subscription.is_active
}

/**
 * Создает новую подписку для пользователя
 *
 * @param subscriptionData Данные подписки
 * @returns ID созданной подписки или null в случае ошибки
 */
export async function createSubscription(
  subscriptionData: Partial<UserSubscription>
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert([subscriptionData])
      .select('id')
      .single()

    if (error) {
      console.error('Error creating subscription:', error)
      return null
    }

    return data.id
  } catch (error) {
    console.error('Error in createSubscription:', error)
    return null
  }
}

/**
 * Обновляет данные подписки
 *
 * @param subscriptionId ID подписки
 * @param updateData Данные для обновления
 * @returns true в случае успеха, иначе false
 */
export async function updateSubscription(
  subscriptionId: number,
  updateData: Partial<UserSubscription>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId)

    if (error) {
      console.error('Error updating subscription:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in updateSubscription:', error)
    return false
  }
}
