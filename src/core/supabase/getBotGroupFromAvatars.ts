import { supabase } from '.'
import { logger } from '@/utils/logger'

export async function getBotGroupFromAvatars(
  bot_name: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('group')
      .eq('bot_name', bot_name)
      .single()

    if (error) {
      logger.error('❌ Ошибка при получении данных из Avatars:', {
        description: 'Error fetching data from Avatars table',
        error,
        bot_name,
      })
      return null
    }

    return data?.group || null
  } catch (error) {
    logger.error('❌ Непредвиденная ошибка при получении данных из Avatars:', {
      description: 'Unexpected error fetching data from Avatars table',
      error,
      bot_name,
    })
    return null
  }
}
