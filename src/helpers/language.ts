import { Context } from 'telegraf'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import { MyContext } from '@/interfaces'
import { updateUserLanguage } from '@/core/supabase/updateUserLanguage'
import { getUserLanguageFromDB } from '@/core/supabase/getUserLanguage'
import { logger } from '@/utils/logger'
import { defaultSession } from '@/store'

// Оригинальная функция была простым телеграм-чекером. Теперь расширяем её:
// 1) Если middleware уже положил язык в ctx.state.userLanguage — используем его.
// 2) Фолбэк – Telegram language_code (старое поведение).

export const isRussian = (ctx: Context): boolean => {
  // @ts-ignore – у стандартного Context нет типизации state, но в MyContext она есть
  const stateLanguage: string | undefined = ctx.state?.userLanguage

  if (stateLanguage) {
    return stateLanguage === 'ru'
  }

  return isRussianLanguageCode(ctx.from?.language_code)
}

// ✅ НОВАЯ СИСТЕМА ЯЗЫКОВ: БД → Сессия → Telegram

/**
 * ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ИСТИНЫ - БАЗА ДАННЫХ
 * Получает язык пользователя ТОЛЬКО из БД (без кэша!)
 * @param ctx - Контекст Telegram
 * @returns Promise<'ru' | 'en'> - язык пользователя
 */
export const getUserLanguage = async (ctx: MyContext): Promise<'ru' | 'en'> => {
  const telegramId = ctx.from?.id?.toString()
  const telegramLanguage = ctx.from?.language_code

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
  logger.info(`[getUserLanguage] 🌍 LANGUAGE CHECK (DB ONLY):`, {
    telegramId,
    telegramLanguage,
    sessionExists: !!ctx.session,
  })

  if (!telegramId) {
    logger.warn(
      '[getUserLanguage] No telegram ID found, using Telegram fallback'
    )
    const fallback = isRussianLanguageCode(ctx.from?.language_code)
      ? 'ru'
      : 'en'
    logger.info(`[getUserLanguage] NO_ID fallback result: ${fallback}`)
    return fallback
  }

  try {
    // ✅ ВСЕГДА ЗАПРАШИВАЕМ ИЗ БД (БЕЗ КЭША!)
    logger.info(
      `[getUserLanguage] 🔍 Checking DATABASE for telegram_id: ${telegramId}`
    )
    const dbLanguage = await getUserLanguageFromDB(telegramId)

    if (dbLanguage) {
      logger.info(`[getUserLanguage] ✅ DATABASE FOUND: ${dbLanguage}`, {
        telegramId,
        source: 'database',
        dbLanguage,
      })
      return dbLanguage
    }

    // ✅ Если в БД нет записи - создаем на основе Telegram
    logger.info(
      `[getUserLanguage] ⚠️ Not found in DB, creating from Telegram: ${telegramLanguage}`,
      {
        telegramId,
        telegramLanguage,
      }
    )

    const newLanguage = isRussianLanguageCode(telegramLanguage) ? 'ru' : 'en'
    await updateUserLanguage(telegramId, newLanguage)

    logger.info(`[getUserLanguage] ✅ CREATED in DB: ${newLanguage}`, {
      telegramId,
      newLanguage,
      source: 'created_from_telegram',
    })

    return newLanguage
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`[getUserLanguage] ❌ DB Error, using Telegram fallback`, {
      telegramId,
      error: errorMessage,
      telegramLanguage,
    })

    const fallback = isRussianLanguageCode(telegramLanguage) ? 'ru' : 'en'
    logger.info(`[getUserLanguage] 🚨 ERROR fallback result: ${fallback}`)
    return fallback
  }
}

/**
 * Синхронная версия для обратной совместимости (использует сессию или Telegram)
 * @param ctx - Контекст Telegram
 * @returns 'ru' | 'en' - язык пользователя
 */
export const getUserLanguageSync = (ctx: MyContext): 'ru' | 'en' => {
  const telegramId = ctx.from?.id?.toString()
  const telegramLanguage = ctx.from?.language_code
  const sessionLanguage = ctx.session?.userLanguage

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
  logger.info(`[getUserLanguageSync] SYNC language check:`, {
    telegramId,
    telegramLanguage,
    sessionLanguage,
    source: sessionLanguage ? 'session' : 'telegram',
  })

  // ✅ ПРАВИЛЬНАЯ ИНИЦИАЛИЗАЦИЯ СЕССИИ
  if (!ctx.session) ctx.session = { ...defaultSession }

  // Сначала проверяем сессию
  if (ctx.session?.userLanguage) {
    logger.info(
      `[getUserLanguageSync] Using SESSION language: ${ctx.session.userLanguage}`,
      {
        telegramId,
      }
    )
    return ctx.session.userLanguage
  }

  // Фоллбэк на Telegram язык
  const result = isRussianLanguageCode(ctx.from?.language_code) ? 'ru' : 'en'
  logger.info(`[getUserLanguageSync] Using TELEGRAM fallback: ${result}`, {
    telegramId,
    telegramLanguage,
  })

  return result
}

/**
 * ✅ ПЕРЕКЛЮЧАЕТ ЯЗЫК НА ПРОТИВОПОЛОЖНЫЙ
 * @param ctx - Контекст Telegram
 * @returns Promise<'ru' | 'en'> - новый язык
 */
export const toggleUserLanguage = async (
  ctx: MyContext
): Promise<'ru' | 'en'> => {
  const telegramId = ctx.from?.id?.toString()

  logger.info(`[toggleUserLanguage] 🔄 LANGUAGE TOGGLE STARTED:`, {
    telegramId,
  })

  const currentLanguage = await getUserLanguage(ctx)
  const newLanguage = currentLanguage === 'ru' ? 'en' : 'ru'

  logger.info(`[toggleUserLanguage] Language toggle plan:`, {
    telegramId,
    currentLanguage,
    newLanguage,
  })

  const success = await setUserLanguage(ctx, newLanguage)

  if (success) {
    logger.info(
      `[toggleUserLanguage] ✅ TOGGLE SUCCESS: ${currentLanguage} → ${newLanguage}`,
      {
        telegramId,
        from: currentLanguage,
        to: newLanguage,
      }
    )
    return newLanguage
  } else {
    logger.error(
      `[toggleUserLanguage] ❌ TOGGLE FAILED, keeping: ${currentLanguage}`,
      {
        telegramId,
        currentLanguage,
      }
    )
    return currentLanguage
  }
}

/**
 * ✅ ПРОВЕРЯЕТ - РУССКИЙ ЛИ ЯЗЫК ПОЛЬЗОВАТЕЛЯ
 * @param ctx - Контекст Telegram
 * @returns Promise<boolean> - true если русский
 */
export const isRussianWithUserChoice = async (
  ctx: MyContext
): Promise<boolean> => {
  const telegramId = ctx.from?.id?.toString()
  const detectedLanguage = await getUserLanguage(ctx)
  const isRussian = detectedLanguage === 'ru'

  logger.info(`[isRussianWithUserChoice] ASYNC Russian check:`, {
    telegramId,
    detectedLanguage,
    isRussian,
  })

  return isRussian
}

/**
 * ✅ УСТАНАВЛИВАЕТ ЯЗЫК В БД (БЕЗ КЭША!)
 * @param ctx - Контекст Telegram
 * @param language - Язык для установки
 * @returns Promise<boolean> - успешность операции
 */
export const setUserLanguage = async (
  ctx: MyContext,
  language: 'ru' | 'en'
): Promise<boolean> => {
  const telegramId = ctx.from?.id?.toString()

  if (!telegramId) {
    logger.error('[setUserLanguage] No telegram ID found')
    return false
  }

  logger.info(`[setUserLanguage] 💾 Saving to DATABASE: ${language}`, {
    telegramId,
    language,
  })

  try {
    await updateUserLanguage(telegramId, language)

    logger.info(`[setUserLanguage] ✅ Successfully saved to DB: ${language}`, {
      telegramId,
      language,
    })

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('[setUserLanguage] ❌ Failed to save language to DB', {
      telegramId,
      language,
      error: errorMessage,
    })

    return false
  }
}
