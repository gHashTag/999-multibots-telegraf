import { logger } from '@/utils/logger'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import type { MyContext } from '@/interfaces/telegram-bot.interface'
import { updateUserLanguage } from '@/core/supabase'

/**
 * ✅ ЦЕНТРАЛИЗОВАННЫЕ ЯЗЫКОВЫЕ ФУНКЦИИ
 *
 * Эти функции используют ctx.state.userLanguage, который устанавливается
 * Language Middleware ОДИН РАЗ за запрос из БД
 */

/**
 * Получает язык пользователя из state (уже загружен middleware)
 * @param ctx - Контекст Telegram
 * @returns 'ru' | 'en' - язык пользователя
 */
export const getUserLanguageFromState = (ctx: MyContext): 'ru' | 'en' => {
  const telegramId = ctx.from?.id?.toString()
  const stateLanguage = ctx.state?.userLanguage
  const telegramLanguage = ctx.from?.language_code

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
  logger.info(`[getUserLanguageFromState] 🎯 GETTING LANGUAGE FROM STATE:`, {
    telegramId,
    stateLanguage,
    telegramLanguage,
    hasState: !!ctx.state,
  })

  if (stateLanguage) {
    logger.info(`[getUserLanguageFromState] ✅ Using STATE: ${stateLanguage}`, {
      telegramId,
      source: 'state',
    })
    return stateLanguage
  }

  // Fallback если middleware не сработал
  const fallback = isRussianLanguageCode(telegramLanguage) ? 'ru' : 'en'
  logger.warn(
    `[getUserLanguageFromState] ⚠️ STATE EMPTY, using fallback: ${fallback}`,
    {
      telegramId,
      source: 'telegram_fallback',
      telegramLanguage,
    }
  )

  return fallback
}

/**
 * Проверяет, русский ли язык пользователя (из state)
 * @param ctx - Контекст Telegram
 * @returns boolean - true если русский
 */
export const isRussianFromState = (ctx: MyContext): boolean => {
  const language = getUserLanguageFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  const isRu = language === 'ru'

  logger.info(`[isRussianFromState] 🔍 RUSSIAN CHECK:`, {
    telegramId,
    language,
    isRussian: isRu,
    source: 'state',
  })

  return isRu
}

/**
 * Устанавливает язык пользователя в БД и обновляет state
 * @param ctx - Контекст Telegram
 * @param language - Новый язык ('ru' | 'en')
 * @returns Promise<boolean> - успех операции
 */
export const setUserLanguageInState = async (
  ctx: MyContext,
  language: 'ru' | 'en'
): Promise<boolean> => {
  const telegramId = ctx.from?.id?.toString()

  logger.info(`[setUserLanguageInState] 💾 SETTING LANGUAGE:`, {
    telegramId,
    newLanguage: language,
    currentState: ctx.state?.userLanguage,
  })

  if (!telegramId) {
    logger.error('[setUserLanguageInState] No telegram ID found')
    return false
  }

  try {
    // ✅ СОХРАНЯЕМ В БД
    await updateUserLanguage(telegramId, language)

    // ✅ ОБНОВЛЯЕМ STATE ДЛЯ ТЕКУЩЕГО ЗАПРОСА
    ctx.state = ctx.state || {}
    ctx.state.userLanguage = language

    logger.info(`[setUserLanguageInState] ✅ LANGUAGE UPDATED:`, {
      telegramId,
      newLanguage: language,
      savedToDB: true,
      updatedState: true,
    })

    return true
  } catch (error) {
    logger.error('[setUserLanguageInState] ❌ DATABASE ERROR:', {
      telegramId,
      language,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Переключает язык пользователя на противоположный
 * @param ctx - Контекст Telegram
 * @returns Promise<'ru' | 'en'> - новый язык
 */
export const toggleUserLanguageInState = async (
  ctx: MyContext
): Promise<'ru' | 'en'> => {
  const telegramId = ctx.from?.id?.toString()
  const currentLanguage = getUserLanguageFromState(ctx)
  const newLanguage = currentLanguage === 'ru' ? 'en' : 'ru'

  logger.info(`[toggleUserLanguageInState] 🔄 TOGGLING LANGUAGE:`, {
    telegramId,
    currentLanguage,
    newLanguage,
  })

  const success = await setUserLanguageInState(ctx, newLanguage)

  if (success) {
    logger.info(`[toggleUserLanguageInState] ✅ TOGGLE SUCCESS:`, {
      telegramId,
      from: currentLanguage,
      to: newLanguage,
    })
    return newLanguage
  } else {
    logger.error(`[toggleUserLanguageInState] ❌ TOGGLE FAILED:`, {
      telegramId,
      currentLanguage,
      newLanguage,
    })
    return currentLanguage
  }
}
