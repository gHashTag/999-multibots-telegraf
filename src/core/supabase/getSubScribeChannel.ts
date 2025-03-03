import { MyContext } from '@/interfaces'

import { supabase } from '@/core/supabase'

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
