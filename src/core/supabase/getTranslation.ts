import { MyContext } from '@/interfaces'
import { supabase } from '.'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '@/core/bot'
import logger from '@/utils/logger'

export async function getTranslation({
  key,
  ctx,
  bot_name,
}: {
  key: string
  ctx: MyContext
  bot_name?: string
}): Promise<{ translation: string; url: string }> {
  console.log('CASE: getTranslation:', key)
  const { language_code } = ctx.from
  const token = ctx.telegram.token

  const botName = bot_name ? bot_name : getBotNameByToken(token).bot_name

  const fetchTranslation = async (name: string) => {
    return await supabase
      .from('translations')
      .select('translation, url')
      .eq('language_code', language_code)
      .eq('key', key)
      .eq('bot_name', name)
      .single()
  }

  // Попытка отправить встроенное сообщение, если перевод не найден
  const getFallbackTranslation = (requestedKey: string) => {
    // Карта ключей к дефолтным переводам
    const fallbackTranslations: Record<
      string,
      { translation: string; url: string }
    > = {
      start: {
        translation:
          'Добро пожаловать в NeuroBot! Бот готов помочь вам с нейросетями.',
        url: '',
      },
      menu: {
        translation: 'Выберите опцию:',
        url: '',
      },
    }

    return (
      fallbackTranslations[requestedKey] || {
        translation: `Перевод для "${requestedKey}" не найден. Пожалуйста, добавьте его в базу данных.`,
        url: '',
      }
    )
  }

  try {
    // Первый запрос с текущим токеном
    let { data, error } = await fetchTranslation(botName)

    // Если ошибка, пробуем с дефолтным токеном
    if (error) {
      logger.warn({
        message: `Ошибка получения перевода с текущим токеном для ключа "${key}"`,
        bot_name: botName,
        language_code,
        key,
      })

      const defaultBot = DEFAULT_BOT_NAME

      ;({ data, error } = await fetchTranslation(defaultBot))

      if (error) {
        logger.error({
          message: `Ошибка получения перевода с дефолтным токеном для ключа "${key}"`,
          error: error.message,
          bot_name: defaultBot,
          language_code,
          key,
        })

        // Используем встроенный перевод
        return getFallbackTranslation(key)
      }
    }

    return {
      translation: data.translation,
      url: data.url,
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    logger.error({
      message: `Критическая ошибка при получении перевода для ключа "${key}"`,
      error: errorMessage,
      bot_name: botName,
      language_code,
      key,
    })

    // Возвращаем запасной вариант при неожиданной ошибке
    return getFallbackTranslation(key)
  }
}
