import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Получает приветственное сообщение для бота из таблицы avatars
 * @param bot_name - имя бота (например, "neuro_blogger_bot")
 * @returns приветственное сообщение или null
 */
export async function getAvatarWelcomeMessage(
  bot_name: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('welcome_message, greeting')
      .eq('bot_name', bot_name)
      .single()

    if (error) {
      logger.warn('⚠️ Не удалось получить приветствие из Avatars:', {
        description: 'Could not fetch welcome message from Avatars table',
        error: error.message,
        bot_name,
      })
      return null
    }

    // Возвращаем welcome_message если есть, иначе greeting, иначе null
    return data?.welcome_message || data?.greeting || null
  } catch (error) {
    logger.error('❌ Ошибка при получении приветствия из Avatars:', {
      description: 'Error fetching welcome message from Avatars table',
      error: error instanceof Error ? error.message : String(error),
      bot_name,
    })
    return null
  }
}
