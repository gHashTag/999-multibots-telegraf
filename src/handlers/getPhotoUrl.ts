import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotNameByToken } from '@/core/bot/index'

export async function getPhotoUrl(
  ctx: MyContext,
  step: number
): Promise<string> {
  const botToken = ctx.telegram.token

  // Динамически определяем имя бота по токену
  const { bot_name } = getBotNameByToken(botToken)

  // Получаем URL аватара из Supabase
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('avatar_url')
      .eq('bot_name', bot_name)
      .single()

    if (error) {
      logger.error('Ошибка при получении URL аватара из Supabase:', {
        description: 'Error fetching avatar URL from Supabase',
        error,
        bot_name,
      })
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/levels/${step}.jpg`
    }

    if (data && data.avatar_url) {
      // Если URL содержит 'levels', заменяем номер шага, иначе добавляем его
      if (data.avatar_url.includes('levels')) {
        return data.avatar_url.replace(/levels\/\d+\.jpg/, `levels/${step}.jpg`)
      } else {
        return `${data.avatar_url.split('.jpg')[0]}/levels/${step}.jpg`
      }
    }
  } catch (err) {
    logger.error('Непредвиденная ошибка при получении URL аватара:', {
      description: 'Unexpected error fetching avatar URL',
      error: err,
      bot_name,
    })
  }

  // Возвращаем значение по умолчанию в случае ошибки
  return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/levels/${step}.jpg`
}
