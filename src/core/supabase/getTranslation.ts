import { MyContext } from '../../interfaces'
import { supabase } from '../supabase'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '../bot'
import { TranslationButton } from '../../interfaces/supabase.interface'

export interface TranslationContext {
  from: { language_code: string }
  telegram: { token: string }
}

const DEFAULT_IMAGE_URL =
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg'

export async function getTranslation({
  key,
  ctx,
  bot_name,
}: {
  key: string
  ctx: MyContext
  bot_name?: string
}): Promise<{
  translation: string
  url: string
  buttons: TranslationButton[]
}> {
  console.log('CASE: getTranslation:', key)
  const { language_code } = ctx.from
  const token = ctx.telegram.token

  const botName = bot_name ? bot_name : getBotNameByToken(token).bot_name
  console.log('botName', botName)

  const fetchTranslation = async (name: string) => {
    return await supabase
      .from('translations')
      .select('translation, url, buttons')
      .eq('language_code', language_code)
      .eq('key', key)
      .eq('bot_name', name)
      .single()
  }

  // Первый запрос с текущим токеном
  let { data, error } = await fetchTranslation(botName)

  // Если ошибка, пробуем с дефолтным токеном
  if (error) {
    console.error('Ошибка получения перевода с текущим токеном')

    const defaultBot = DEFAULT_BOT_NAME

    ;({ data, error } = await fetchTranslation(defaultBot))

    if (error) {
      console.error('Ошибка получения перевода с дефолтным токеном:', error)
      return {
        translation: 'Ошибка загрузки перевода',
        url: DEFAULT_IMAGE_URL,
        buttons: [],
      }
    }
  }

  return {
    translation: data.translation,
    url: data.url,
    buttons: data.buttons,
  }
}
