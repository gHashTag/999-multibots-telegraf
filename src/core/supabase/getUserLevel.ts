import { supabase } from '.'

/**
 * Функция для получения уровня пользователя по его telegram_id.
 * @param telegram_id - Идентификатор пользователя в Telegram.
 * @returns Уровень пользователя или null, если пользователь не найден.
 */
export async function getUserLevel(
  telegram_id: string
): Promise<number | null> {
  try {
    // Запрашиваем данные пользователя из таблицы 'users'
    const { data, error } = await supabase
      .from('users')
      .select('level')
      .eq('telegram_id', telegram_id)
      .single() // Используем .single(), так как ожидаем только одну запись

    if (error) {
      console.error('Ошибка при получении уровня пользователя:', error)
      return null
    }

    // Если данные найдены, возвращаем уровень
    if (data) {
      return data.level
    }

    // Если пользователь не найден
    return null
  } catch (e) {
    console.error('Ошибка в функции getUserLevel:', e)
    return null
  }
}
