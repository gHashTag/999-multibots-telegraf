import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getBotNameByToken } from '@/core/bot/index'
import { DEFAULT_BOT_PHOTO_URL } from '@/config/publicStorage'

export { DEFAULT_BOT_PHOTO_URL }

export async function getPhotoUrl(ctx: MyContext): Promise<string> {
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
      // A bot with no row in `avatars` is an ordinary state, not an incident:
      // `.single()` reports zero rows as PGRST116 and this function answers it
      // with a fallback URL that works. It was logged at ERROR, and every
      // logger.error is forwarded to the owner's Telegram, so onboarding a new
      // bot (t27ai_bot, added after the 15-bot avatar census) posted a 🚨 to
      // the owner each time somebody pressed Start. The house idiom for this is
      // in checkAvatarTransformUsage.ts: name the code, log it as information.
      // `const m = logger.info` would arrive without its instance -- the same
      // detached-method trap that answered a photo send with
      // "Cannot read properties of undefined". Call it attached.
      if ((error as { code?: string }).code === 'PGRST116') {
        logger.info('Аватар бота не задан, берём изображение по умолчанию', {
          description: 'No avatar row for this bot; using the default image',
          bot_name,
        })
      } else {
        logger.error('Ошибка при получении URL аватара из Supabase:', {
          description: 'Error fetching avatar URL from Supabase',
          error,
          bot_name,
        })
      }
      return DEFAULT_BOT_PHOTO_URL
    }

    if (data && data.avatar_url) {
      // The stored URL is returned exactly as stored.
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
  return DEFAULT_BOT_PHOTO_URL
}
