import { Context } from 'telegraf'
import { MyContext } from '@/interfaces'
import { updateUserLanguage } from '@/core/supabase/updateUserLanguage'
import { getUserLanguageFromDB } from '@/core/supabase/getUserLanguage'
import { logger } from '@/utils/logger'

// Оригинальная функция - используется как fallback
export const isRussian = (ctx: Context) => ctx.from?.language_code === 'ru'

// ✅ НОВАЯ СИСТЕМА ЯЗЫКОВ: БД → Сессия → Telegram

/**
 * Получает язык пользователя с учетом приоритета: БД → сессия → Telegram
 * @param ctx - Контекст Telegram
 * @returns Promise<'ru' | 'en'> - язык пользователя
 */
export const getUserLanguage = async (ctx: MyContext): Promise<'ru' | 'en'> => {
  const telegramId = ctx.from?.id?.toString()

  if (!telegramId) {
    logger.warn('[getUserLanguage] No telegram ID found, using fallback')
    return ctx.from?.language_code === 'ru' ? 'ru' : 'en'
  }

  try {
    // 1. ПРИОРИТЕТ: Проверяем БД
    const dbLanguage = await getUserLanguageFromDB(telegramId)
    if (dbLanguage) {
      logger.info(`[getUserLanguage] Using language from DB: ${dbLanguage}`, {
        telegramId,
        source: 'database',
      })

      // Синхронизируем с сессией для быстрого доступа
      if (!ctx.session) ctx.session = {}
      ctx.session.userLanguage = dbLanguage

      return dbLanguage
    }

    // 2. РЕЗЕРВ: Проверяем сессию
    if (ctx.session?.userLanguage) {
      logger.info(
        `[getUserLanguage] Using language from session: ${ctx.session.userLanguage}`,
        {
          telegramId,
          source: 'session',
        }
      )
      return ctx.session.userLanguage
    }

    // 3. FALLBACK: Используем Telegram язык
    const telegramLanguage = ctx.from?.language_code === 'ru' ? 'ru' : 'en'
    logger.info(
      `[getUserLanguage] Using language from Telegram: ${telegramLanguage}`,
      {
        telegramId,
        source: 'telegram',
      }
    )

    return telegramLanguage
  } catch (error) {
    logger.error('[getUserLanguage] Error getting user language:', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
    })

    // Fallback в случае ошибки
    return ctx.from?.language_code === 'ru' ? 'ru' : 'en'
  }
}

/**
 * Синхронная версия для обратной совместимости (использует сессию или Telegram)
 * @param ctx - Контекст Telegram
 * @returns 'ru' | 'en' - язык пользователя
 */
export const getUserLanguageSync = (ctx: MyContext): 'ru' | 'en' => {
  // Сначала проверяем сессию
  if (ctx.session?.userLanguage) {
    return ctx.session.userLanguage
  }

  // Fallback на Telegram
  return ctx.from?.language_code === 'ru' ? 'ru' : 'en'
}

/**
 * Проверяет, является ли текущий язык русским (асинхронная версия)
 * @param ctx - Контекст Telegram
 * @returns Promise<boolean> - true если русский
 */
export const isRussianWithUserChoice = async (
  ctx: MyContext
): Promise<boolean> => {
  const language = await getUserLanguage(ctx)
  return language === 'ru'
}

/**
 * Синхронная версия проверки русского языка (для обратной совместимости)
 * @param ctx - Контекст Telegram
 * @returns boolean - true если русский
 */
export const isRussianWithUserChoiceSync = (ctx: MyContext): boolean => {
  const language = getUserLanguageSync(ctx)
  return language === 'ru'
}

/**
 * Сохраняет выбор языка пользователя в БД и сессии
 * @param ctx - Контекст Telegram
 * @param language - Язык ('ru' или 'en')
 * @returns Promise<boolean> - true если сохранение успешно
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

  try {
    // Сохраняем в БД
    const dbSuccess = await updateUserLanguage(telegramId, language)

    if (dbSuccess) {
      // Синхронизируем с сессией
      if (!ctx.session) ctx.session = {}
      ctx.session.userLanguage = language

      logger.info(
        `[setUserLanguage] Successfully updated language to ${language}`,
        {
          telegramId,
          language,
        }
      )

      return true
    } else {
      logger.error(`[setUserLanguage] Failed to update language in DB`, {
        telegramId,
        language,
      })
      return false
    }
  } catch (error) {
    logger.error('[setUserLanguage] Error setting user language:', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      language,
    })
    return false
  }
}

/**
 * Переключает язык пользователя на противоположный
 * @param ctx - Контекст Telegram
 * @returns Promise<'ru' | 'en'> - новый язык
 */
export const toggleUserLanguage = async (
  ctx: MyContext
): Promise<'ru' | 'en'> => {
  const currentLanguage = await getUserLanguage(ctx)
  const newLanguage = currentLanguage === 'ru' ? 'en' : 'ru'

  const success = await setUserLanguage(ctx, newLanguage)

  if (success) {
    logger.info(
      `[toggleUserLanguage] Language toggled from ${currentLanguage} to ${newLanguage}`,
      {
        telegramId: ctx.from?.id?.toString(),
      }
    )
    return newLanguage
  } else {
    logger.error(`[toggleUserLanguage] Failed to toggle language`, {
      telegramId: ctx.from?.id?.toString(),
      currentLanguage,
      attemptedNewLanguage: newLanguage,
    })
    return currentLanguage // Возвращаем текущий язык если не удалось переключить
  }
}
