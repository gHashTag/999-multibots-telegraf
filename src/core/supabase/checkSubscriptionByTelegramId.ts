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
    // Получаем информацию о пользователе из таблицы users вместо payments_v2
    const { data, error } = await supabase
      .from('users')
      .select('id, created_at, subscription, level')
      .eq('telegram_id', id)
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
