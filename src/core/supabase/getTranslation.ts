import { MyContext } from '@/interfaces'
import { supabase } from '.'
import { DEFAULT_BOT_TOKEN } from '@/core/bot'

export async function getTranslation({
  key,
  ctx,
}: {
  key: string
  ctx: MyContext
}): Promise<{ translation: string; url: string }> {
  console.log('CASE: getTranslation:', key)
  const { language_code } = ctx.from
  const token = ctx.telegram.token

  const fetchTranslation = async (tokenToUse: string) => {
    return await supabase
      .from('translations')
      .select('translation, url')
      .eq('language_code', language_code)
      .eq('key', key)
      .eq('token', tokenToUse)
      .single()
  }

  // Первый запрос с текущим токеном
  let { data, error } = await fetchTranslation(token)

  // Если ошибка, пробуем с дефолтным токеном
  if (error) {
    console.error('Ошибка получения перевода с текущим токеном:', error)

    const defaultToken = DEFAULT_BOT_TOKEN

    ;({ data, error } = await fetchTranslation(defaultToken))

    if (error) {
      console.error('Ошибка получения перевода с дефолтным токеном:', error)
      return {
        translation: 'Ошибка загрузки перевода',
        url: '',
      }
    }
  }

  console.log('data', data)

  return {
    translation: data.translation,
    url: data.url,
  }
}
