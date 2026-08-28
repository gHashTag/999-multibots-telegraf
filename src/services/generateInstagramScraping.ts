// ВРЕМЕННО: inngest отключён
// import { inngest } from '@/inngest_app/client'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export interface InstagramScrapingRequest {
  username_or_id: string
  project_id: number
  max_users?: number
  max_reels_per_user?: number
  scrape_reels?: boolean
  requester_telegram_id: string
}

export interface InstagramScrapingResponse {
  success: boolean
  eventId?: string
  message: string
  error?: string
}

export async function generateInstagramScraping(
  username_or_id: string,
  project_id: number,
  max_users = 50, // Правильное имя параметра для API
  max_reels_per_user = 50,
  scrape_reels = false,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<InstagramScrapingResponse | null> {
  const isRu = isRussianFromState(ctx)

  logger.info('🔍 [Instagram Scraper] Запуск анализа конкурентов Instagram', {
    description: 'Starting Instagram competitor analysis via Inngest',
    username_or_id,
    project_id,
    max_users, // Используем max_users согласно API документации
    max_reels_per_user,
    scrape_reels,
    telegram_id,
    botName,
    environment: process.env.NODE_ENV,
    inngestHost:
      process.env.INNGEST_DEV_URL || process.env.INNGEST_PROD_URL || 'N/A',
  })

  console.log('🔥 [DEBUG] Function parameters:', {
    username_or_id,
    project_id,
    max_users,
    max_reels_per_user,
    scrape_reels,
    telegram_id,
    botName,
    context: {
      userId: ctx.from?.id,
      chatId: ctx.chat.id,
      messageId: ctx.message?.message_id,
      callbackQuery: ctx.callbackQuery ? 'present' : 'absent',
    },
  })

  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    logger.info('✅ [Instagram Scraper] Typing action sent successfully', {
      telegram_id,
    })
  } catch (error) {
    logger.warn('⚠️ [Instagram Scraper] Failed to send typing action', {
      error: error.message,
      telegram_id,
    })
  }

  try {
    const debugSessionId = `debug-${Date.now()}`
    const eventData = {
      username_or_id,
      project_id,
      max_users,
      max_reels_per_user,
      scrape_reels,
      requester_telegram_id: telegram_id,
      // Дополнительные данные для контекста
      username: ctx.from?.username,
      bot_name: botName,
      language: isRu ? 'ru' : 'en',
      timestamp: new Date().toISOString(),

      // 🔥 ДЕБАГ ДАННЫЕ - помогут найти событие в логах ai-server
      debug_source: 'telegram-bot',
      debug_session_id: debugSessionId,
    }

    console.log(
      '🔥 [DEBUG] SENDING EVENT DATA:',
      JSON.stringify(eventData, null, 2)
    )

    // 🚀 Отправляем событие в Inngest через SDK (работает и в dev, и в production!)
    console.log(
      `📤 [${process.env.NODE_ENV?.toUpperCase()}] Отправляем событие через Inngest SDK...`
    )

    // Имя события — 'instagram/scraper-v2'. Здесь стояло 'instagram/scraper',
    // а единственный подписчик объявлен как
    // `{ event: 'instagram/scraper-v2' }` (instagramScraper-v2.ts:1196).
    // Событие с прежним именем не взял бы никто — и об этом не сообщила бы ни
    // одна ошибка: Inngest просто не находит подписчика.
    const inngestEvent = {
      name: 'instagram/scraper-v2',
      data: eventData,
      user: {
        external_id: telegram_id, // Для отслеживания пользователя (шифруется)
      },
      // ID для дедупликации - избегаем повторных запусков
      id: `instagram-scraper-${telegram_id}-${username_or_id}-${Date.now()}`,
    }

    logger.info('📤 [Instagram Scraper] Подготовлено событие', {
      eventName: inngestEvent.name,
      eventId: inngestEvent.id,
      userId: telegram_id,
      debugSessionId,
      environment: process.env.NODE_ENV,
    })

    // ОТКАЗЫВАЕМ ЧЕСТНО. Отправка события здесь отключена строкой
    // `// const sendResult = await inngest.send(inngestEvent)` с пометкой
    // «ВРЕМЕННО». Дальше стояло `const sendResult = { ids: ['disabled'] }`,
    // запись в лог «✅ Событие успешно отправлено в Inngest» и
    // `return { success: true, message: '🚀 Анализ запущен! Результаты будут
    // готовы через несколько минут.' }`.
    //
    // То есть функция ЛГАЛА трижды: в логе, в коде возврата и в тексте
    // пользователю. А вызывающая сцена (instagramParserScene) списывала за это
    // деньги ДО вызова и смотрела только на `result.success`.
    //
    // Измерено: 28 списаний service_type='instagram_parser' у трёх человек на
    // 94 звезды. Ни одного запуска при этом не было.
    //
    // Включить нельзя: RAPIDAPI_INSTAGRAM_KEY в проде НЕ ЗАДАНА, и функция
    // instagramScraperV2 без неё всё равно упадёт. То есть «раскомментировать»
    // — не починка, а перенос отказа на шаг позже, уже после списания.
    //
    // Что нужно, чтобы включить: задать RAPIDAPI_INSTAGRAM_KEY и
    // RAPIDAPI_INSTAGRAM_HOST, затем заменить этот блок на
    // `await inngest.send(inngestEvent)`.
    logger.error(
      '❌ [Instagram Scraper] Отправка отключена — отказываем явно',
      {
        description:
          'Inngest send is disabled in code; refusing instead of faking success',
        telegram_id,
        eventName: inngestEvent.name,
        rapidapi_key_set: Boolean(process.env.RAPIDAPI_INSTAGRAM_KEY),
      }
    )

    return {
      success: false,
      error:
        'instagram scraping is disabled: inngest send is commented out and RAPIDAPI_INSTAGRAM_KEY is not set',
      message: isRu
        ? '⚠️ Анализ конкурентов Instagram сейчас недоступен: обработчик отключён. Средства не списаны.'
        : '⚠️ Instagram competitor analysis is unavailable: the handler is switched off. You have not been charged.',
    }
  } catch (error) {
    console.error('🔥 [DEBUG] Full error object:', error)

    logger.error(
      '❌ [Instagram Scraper] Ошибка при отправке события в Inngest',
      {
        description: 'Error sending event to Inngest',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        errorName: error instanceof Error ? error.name : 'Unknown error type',
        telegram_id,
        environment: process.env.NODE_ENV,
        inngestConfig: {
          devUrl: process.env.INNGEST_DEV_URL,
          prodUrl: process.env.INNGEST_PROD_URL,
        },
      }
    )

    const errorMessage = isRu
      ? 'Произошла ошибка при запуске поиска конкурентов. Пожалуйста, попробуйте позже.'
      : 'An error occurred while starting competitor search. Please try again later.'

    console.log('🔥 [DEBUG] About to send error message to user:', errorMessage)

    try {
      if (ctx.reply) {
        await ctx.reply(errorMessage)
        logger.info('✅ [Instagram Scraper] Error message sent to user', {
          telegram_id,
        })
      }
    } catch (replyError) {
      logger.error(
        '❌ [Instagram Scraper] Failed to send error message to user',
        {
          replyError:
            replyError instanceof Error ? replyError.message : 'Unknown error',
          telegram_id,
        }
      )
    }

    return {
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
