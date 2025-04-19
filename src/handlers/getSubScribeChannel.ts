import { MyContext } from '@/interfaces'

import { supabase } from '@/core/supabase'

export const DEFAULT_CHANNEL_ID = '@neuro_blogger_group' // Значение по умолчанию, если ID не найден
/**
 * Определяет канал для подписки в зависимости от ID бота
 * @param ctx Контекст Telegram
 * @returns Название канала для подписки
 */

export async function getSubScribeChannel(
  ctx: MyContext
): Promise<string | null> {
  try {
    const bot_name = ctx.botInfo.username
    const { data, error } = await supabase
      .from('avatars')
      .select('group')
      .eq('bot_name', bot_name)
      .single()

    if (error) {
      console.error('Ошибка при получении группы:', error)
      return null
    }

    return data?.group || null
  } catch (error) {
    console.error('Ошибка в getAvatarGroup:', error)
    return null
  }
}
