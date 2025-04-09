import { MyContext } from '@/interfaces/telegram-bot.interface'
import { supabase } from '@/core/supabase'
import { TranslationButton } from '@/interfaces/supabase.interface'
import { logger } from '@/utils/logger'
import {
  TranslationCategory,
  TranslationCategoryType,
  Translation,
} from '@/interfaces/translations.interface'

interface TranslationResponse {
  translation: string
  url?: string
  buttons?: TranslationButton[]
}

export interface TranslationContext {
  from: { language_code: string }
  telegram: { token: string }
}

async function fetchTranslation(
  key: string,
  bot_name: string,
  language_code: string,
  category: TranslationCategoryType,
  is_override?: boolean
): Promise<Translation | null> {
  const query = supabase
    .from('translations')
    .select('*')
    .eq('key', key)
    .eq('language_code', language_code)
    .eq('category', category)

  if (category === TranslationCategory.SPECIFIC) {
    query.eq('bot_name', bot_name)
    if (is_override !== undefined) {
      query.eq('is_override', is_override)
    }
  }

  const { data, error } = await query

  if (error) {
    logger.error('Error fetching translation:', {
      error,
      key,
      bot_name,
      language_code,
      category,
    })
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  // Возвращаем первый найденный перевод
  return data[0]
}

export async function getTranslation({
  key,
  ctx,
  bot_name,
}: {
  key: string
  ctx: MyContext
  bot_name?: string
}): Promise<TranslationResponse> {
  const language_code = ctx.from?.language_code || 'en'
  const current_bot = bot_name || ctx.botInfo?.username || ''

  // Try to find specific override translation for current bot
  let translation = await fetchTranslation(
    key,
    current_bot,
    language_code,
    TranslationCategory.SPECIFIC,
    true
  )
  if (translation) {
    logger.debug('Found override translation', { key, bot: current_bot })
    return {
      translation: translation.translation,
      url: translation.url,
      buttons: translation.buttons,
    }
  }

  // Try to find specific translation for current bot
  translation = await fetchTranslation(
    key,
    current_bot,
    language_code,
    TranslationCategory.SPECIFIC
  )
  if (translation) {
    logger.debug('Found specific translation', { key, bot: current_bot })
    return {
      translation: translation.translation,
      url: translation.url,
      buttons: translation.buttons,
    }
  }

  // Try to find common translation
  translation = await fetchTranslation(
    key,
    current_bot,
    language_code,
    TranslationCategory.COMMON
  )
  if (translation) {
    logger.debug('Found common translation', { key })
    return {
      translation: translation.translation,
      url: translation.url,
      buttons: translation.buttons,
    }
  }

  // Try to find system translation
  translation = await fetchTranslation(
    key,
    current_bot,
    language_code,
    TranslationCategory.SYSTEM
  )
  if (translation) {
    logger.debug('Found system translation', { key })
    return {
      translation: translation.translation,
      url: translation.url,
      buttons: translation.buttons,
    }
  }

  // Try to find default translation from neuro_blogger_bot
  translation = await fetchTranslation(
    key,
    'neuro_blogger_bot',
    language_code,
    TranslationCategory.SPECIFIC
  )
  if (translation) {
    logger.debug('Using default translation from neuro_blogger_bot', { key })
    return {
      translation: translation.translation,
      url: translation.url,
      buttons: translation.buttons,
    }
  }

  // No translation found
  logger.warn('Translation not found', {
    key,
    bot: current_bot,
    language: language_code,
  })
  return {
    translation: `Translation not found for key: ${key}`,
  }
}
