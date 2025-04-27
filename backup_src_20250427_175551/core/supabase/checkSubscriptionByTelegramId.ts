import { supabase } from '@/core/supabase'

/**
 * Проверяет наличие и статус подписки пользователя по Telegram ID
 * @param id Telegram ID пользователя
 * @returns Уровень подписки или 'unsubscribed' если подписка не активна
 */
export const checkSubscriptionByTelegramId = async (
  id: string
): Promise<string> => {
  try {
    // Получаем последнюю запись о платеже пользователя
    const { data, error } = await supabase
      .from('payments_v2')
      .select('id, created_at, subscription, level')
      .eq('telegram_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Обрабатываем ошибку запроса
    if (error) {
      console.error('Ошибка при получении информации о подписке:', error)
      return 'unsubscribed'
    }

    // Если данных нет, значит подписки нет
    if (!data) {
      return 'unsubscribed'
    }

    // Проверяем, что платеж был в течение последних 30 дней
    const paymentDate = new Date(data.created_at)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Если платеж старше 30 дней, считаем что подписка неактивна
    if (paymentDate < thirtyDaysAgo) {
      return 'unsubscribed'
    }

    // Возвращаем уровень подписки
    return data.level
  } catch (err) {
    console.error('Непредвиденная ошибка при проверке подписки:', err)
    return 'unsubscribed'
  }
}
