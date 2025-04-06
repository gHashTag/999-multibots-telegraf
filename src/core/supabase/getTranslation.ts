import { MyContext } from '../../interfaces'
import { supabase } from '../supabase'
import { getBotNameByToken, DEFAULT_BOT_NAME } from '../bot'
import { TranslationButton } from '../../interfaces/supabase.interface'
import { logger } from '@/utils/logger'

export interface TranslationContext {
  from: { language_code: string }
  telegram: { token: string }
}

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
  logger.info('🔍 Получение перевода:', {
    description: 'Getting translation',
    key,
  })

  const language_code = ctx.from?.language_code || 'en'
  const token = ctx.telegram.token

  const botName = bot_name ? bot_name : getBotNameByToken(token).bot_name
  logger.info('🤖 Имя бота:', {
    description: 'Bot name',
    botName,
  })

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
    logger.error('❌ Ошибка получения перевода с текущим токеном:', {
      description: 'Error getting translation with current token',
      error: error.message,
    })

    const defaultBot = DEFAULT_BOT_NAME

    ;({ data, error } = await fetchTranslation(defaultBot))

    if (error) {
      logger.error('❌ Ошибка получения перевода с дефолтным токеном:', {
        description: 'Error getting translation with default token',
        error: error.message,
      })
      return {
        translation: 'Ошибка загрузки перевода',
        url: '',
        buttons: [],
      }
    }
  }

  if (!data) {
    logger.error('❌ Данные перевода не найдены:', {
      description: 'Translation data not found',
      key,
      language_code,
    })
    return {
      translation: 'Перевод не найден',
      url: '',
      buttons: [],
    }
  }

  logger.info('✅ Перевод получен:', {
    description: 'Translation retrieved successfully',
    key,
    language_code,
  })

  return {
    translation: data.translation || '',
    url: data.url || '',
    buttons: data.buttons || [],
  }
}
