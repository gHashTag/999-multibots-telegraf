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
      // URL со схемой levels/N.jpg — подставляем нужный шаг.
      if (data.avatar_url.includes('levels')) {
        return data.avatar_url.replace(/levels\/\d+\.jpg/, `levels/${step}.jpg`)
      }

      // Иначе отдаём сохранённый URL как есть.
      //
      // Раньше здесь было `${avatar_url.split('.jpg')[0]}/levels/${step}.jpg`,
      // то есть из ИМЕНИ ФАЙЛА выдумывался каталог. Проверено HEAD-запросами по
      // всем 15 ботам: сконструированный так URL живой в 0 случаях из 15, а
      // сохранённый avatar_url — в 11 из 15 (оставшиеся 4 это placeholder.com и
      // example.com, которых не существовало никогда).
      //
      // На URL без '.jpg' — а таких среди живых значений большинство — split
      // возвращал строку целиком, и получалось
      // 'https://via.placeholder.com/150?text=AI/levels/1.jpg'.
      return data.avatar_url
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
