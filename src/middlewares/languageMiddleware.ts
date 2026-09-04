import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import { getUserLanguageFromDB } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * ✅ ЦЕНТРАЛИЗОВАННЫЙ LANGUAGE MIDDLEWARE
 *
 * Получает язык пользователя из БД ОДИН РАЗ за запрос
 * и сохраняет в ctx.state.userLanguage для использования во всех функциях
 *
 * @param ctx - Контекст Telegram
 * @param next - Следующий middleware
 */
export const languageMiddleware = async (
  ctx: MyContext,
  next: () => Promise<void>
): Promise<void> => {
  const telegramId = ctx.from?.id?.toString()
  const telegramLanguage = ctx.from?.language_code

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКОВОГО MIDDLEWARE
  logger.info(`[LanguageMiddleware] 🌍 LANGUAGE MIDDLEWARE STARTED:`, {
    telegramId,
    telegramLanguage,
    hasSession: !!ctx.session,
  })

  if (!telegramId) {
    // Если нет telegramId, используем fallback язык
    const fallbackLanguage = isRussianLanguageCode(telegramLanguage)
      ? 'ru'
      : 'en'
    ctx.state = ctx.state || {}
    ctx.state.userLanguage = fallbackLanguage

    logger.warn('[LanguageMiddleware] No telegram ID, using fallback', {
      fallbackLanguage,
    })

    return next()
  }

  try {
    // ✅ ПОЛУЧАЕМ ЯЗЫК ИЗ БД ОДИН РАЗ
    const dbLanguage = await getUserLanguageFromDB(telegramId)

    let finalLanguage: 'ru' | 'en'

    if (dbLanguage) {
      // База данных имеет приоритет
      finalLanguage = dbLanguage
      logger.info(`[LanguageMiddleware] ✅ DATABASE FOUND: ${dbLanguage}`, {
        telegramId,
        source: 'database',
        dbLanguage,
      })
    } else {
      // Fallback к Telegram языку
      finalLanguage = isRussianLanguageCode(telegramLanguage) ? 'ru' : 'en'
      logger.info(
        `[LanguageMiddleware] 🔄 DATABASE EMPTY, using Telegram: ${finalLanguage}`,
        {
          telegramId,
          source: 'telegram',
          telegramLanguage,
          finalLanguage,
        }
      )
    }

    // ✅ СОХРАНЯЕМ В STATE ДЛЯ ВСЕХ ФУНКЦИЙ
    ctx.state = ctx.state || {}
    ctx.state.userLanguage = finalLanguage

    logger.info(`[LanguageMiddleware] 🎯 LANGUAGE SET: ${finalLanguage}`, {
      telegramId,
      finalLanguage,
      source: dbLanguage ? 'database' : 'telegram',
    })
  } catch (error) {
    // В случае ошибки БД используем Telegram fallback
    const fallbackLanguage = isRussianLanguageCode(telegramLanguage)
      ? 'ru'
      : 'en'
    ctx.state = ctx.state || {}
    ctx.state.userLanguage = fallbackLanguage

    logger.error('[LanguageMiddleware] ❌ DATABASE ERROR, using fallback', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      fallbackLanguage,
    })
  }

  // ✅ ПЕРЕДАЕМ УПРАВЛЕНИЕ ДАЛЬШЕ
  await next()
}
