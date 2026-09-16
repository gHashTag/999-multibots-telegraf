import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
// Deliberately NOT from '@/helpers/language': that module imports '@/store',
// which transitively loads the scenes, and this middleware runs at bootstrap.
import { senderOf, statedLanguageCode } from '@/helpers/senderOf'
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
  // senderOf, not ctx.from. Production, 2026-09-16, four and eight seconds
  // either side of a business DM from chat 435572800:
  //   [WARN]: [LanguageMiddleware] No telegram ID, using fallback {"fallbackLanguage":"en"}
  // telegraf 4.16.3 resolves no sender at all for business_message /
  // edited_business_message / business_connection (measured: ctx.from AND
  // ctx.chat are both undefined), so both reads below were undefined and this
  // middleware -- the single point where a raw code becomes the 'ru' | 'en'
  // that 103 call sites read -- answered English for a Russian-speaking
  // audience. senderOf finds the sender where telegraf actually puts it.
  const sender = senderOf(ctx)
  const telegramId = sender?.id?.toString()
  // Two values on purpose: telegramLanguage is what Telegram ACTUALLY sent and
  // is what gets logged, so the logs stay honest about an absent code.
  // statedLanguage is what the decisions below read, and it treats an absent
  // code as Russian -- a missing signal is not evidence of English. See
  // statedLanguageCode in helpers/language.ts for why this repo already
  // requires that.
  const telegramLanguage = sender?.language_code
  const statedLanguage = statedLanguageCode(sender)

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКОВОГО MIDDLEWARE
  logger.info(`[LanguageMiddleware] 🌍 LANGUAGE MIDDLEWARE STARTED:`, {
    telegramId,
    telegramLanguage,
    hasSession: !!ctx.session,
  })

  if (!telegramId) {
    // Если нет telegramId, используем fallback язык
    const fallbackLanguage = isRussianLanguageCode(statedLanguage) ? 'ru' : 'en'
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
      // Fallback к Telegram языку. A code that is PRESENT and says a
      // non-Russian language still resolves to English -- that is a real answer
      // and is deliberately unchanged. Only the absent-code case moved.
      finalLanguage = isRussianLanguageCode(statedLanguage) ? 'ru' : 'en'
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
    const fallbackLanguage = isRussianLanguageCode(statedLanguage) ? 'ru' : 'en'
    ctx.state = ctx.state || {}
    ctx.state.userLanguage = fallbackLanguage

    // Stays at error, deliberately. This fires only if getUserLanguageFromDB
    // itself throws -- it catches internally today -- so it is the genuine
    // "our database is down" signal, which is our machinery and must page.
    logger.error('[LanguageMiddleware] ❌ DATABASE ERROR, using fallback', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      fallbackLanguage,
    })
  }

  // ✅ ПЕРЕДАЕМ УПРАВЛЕНИЕ ДАЛЬШЕ
  await next()
}
