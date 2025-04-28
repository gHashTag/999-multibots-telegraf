import { supabase } from '../core/supabase/client'
import { UserSettings, UserType } from '@/interfaces/supabase.interface'
import { logger } from '../utils/logger'

/**
 * Получает профиль пользователя и его настройки из базы данных по Telegram ID.
 * @param telegramId - ID пользователя в Telegram.
 * @returns Объект с профилем пользователя (UserType) и его настройками (UserSettings), или null если не найден.
 */
export async function getUserProfileAndSettings(
  telegramId: number
): Promise<{ profile: UserType | null; settings: UserSettings | null }> {
  try {
    // Запрашиваем одним запросом user_id и model
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .select('user_id, model') // Выбираем user_id и model
      .eq('telegram_id', telegramId)
      .single<UserType>() // Указываем тип для data

    if (profileError || !profileData) {
      logger.error('Error fetching user profile data:', {
        telegramId,
        profileError,
      })
      return { profile: null, settings: null }
    }

    // Создаем объект настроек
    const settings: UserSettings = {
      imageModel: profileData.model ?? null,
    }

    // Возвращаем найденный профиль и настройки
    return { profile: profileData, settings }
  } catch (error) {
    logger.error('Unexpected error in getUserProfileAndSettings:', {
      telegramId,
      error,
    })
    return { profile: null, settings: null }
  }
}
