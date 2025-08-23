import { inngest } from '@/inngest_app/client'
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
  max_users: number = 50, // Правильное имя параметра для API
  max_reels_per_user: number = 50,
  scrape_reels: boolean = false,
  telegram_id: string,
  ctx: MyContext,
  botName: string
): Promise<InstagramScrapingResponse | null> {
  const isRu = isRussianFromState(ctx)

  logger.info({
    message: '🔍 [Instagram Scraper] Запуск анализа конкурентов Instagram',
    description: 'Starting Instagram competitor analysis via Inngest',
    username_or_id,
    project_id,
    max_users, // Используем max_users согласно API документации
    max_reels_per_user,
    scrape_reels,
    telegram_id,
    botName,
    environment: process.env.NODE_ENV,
    inngestHost: process.env.INNGEST_DEV_URL || process.env.INNGEST_PROD_URL || 'N/A'
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
      callbackQuery: ctx.callbackQuery ? 'present' : 'absent'
    }
  })

  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    logger.info('✅ [Instagram Scraper] Typing action sent successfully', { telegram_id })
  } catch (error) {
    logger.warn('⚠️ [Instagram Scraper] Failed to send typing action', { 
      error: error.message, 
      telegram_id 
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

    const inngestEvent = {
      name: 'instagram/scraper-v2',
      data: eventData,
      user: {
        external_id: telegram_id, // Для отслеживания пользователя (шифруется)
      },
      // ID для дедупликации - избегаем повторных запусков
      id: `instagram-scraper-${telegram_id}-${username_or_id}-${Date.now()}`,
    }

    console.log('🔥 [DEBUG] Final Inngest event payload:', JSON.stringify(inngestEvent, null, 2))
    
    logger.info('📤 [Instagram Scraper] About to send event to Inngest', {
      eventName: inngestEvent.name,
      eventId: inngestEvent.id,
      userId: telegram_id,
      environment: process.env.NODE_ENV
    })

    const sendResult = await inngest.send(inngestEvent)
    
    console.log('🔥 [DEBUG] Inngest send result:', sendResult)
    logger.info('✅ [Instagram Scraper] Event sent to Inngest with result', {
      sendResult,
      telegram_id
    })

    console.log(
      `✅ [${process.env.NODE_ENV?.toUpperCase()}] Event sent via SDK to:`,
      process.env.NODE_ENV === 'development'
        ? 'localhost:8288'
        : (process.env.SERVER_API_URL?.replace('https://', '') ||
            'ai-server-production-production-8e2d.up.railway.app') +
            '/api/inngest'
    )
    console.log(
      `🔥 [DEBUG] Event sent with debug_session_id: ${debugSessionId}`
    )
    console.log(`🔥 [DEBUG] Check ai-server logs for this session_id!`)

    logger.info({
      message: '✅ [Instagram Scraper] Событие успешно отправлено в Inngest',
      description: 'Event successfully sent to Inngest',
      telegram_id,
    })

    return {
      success: true,
      eventId: 'sent', // Простое подтверждение отправки
      message: isRu
        ? '🚀 Анализ конкурентов Instagram запущен! Результаты будут готовы через несколько минут.'
        : '🚀 Instagram competitor analysis started! Results will be ready in a few minutes.',
    }
  } catch (error) {
    console.error('🔥 [DEBUG] Full error object:', error)
    
    logger.error({
      message: '❌ [Instagram Scraper] Ошибка при отправке события в Inngest',
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      errorName: error instanceof Error ? error.name : 'Unknown error type',
      telegram_id,
      environment: process.env.NODE_ENV,
      inngestConfig: {
        devUrl: process.env.INNGEST_DEV_URL,
        prodUrl: process.env.INNGEST_PROD_URL
      }
    })

    const errorMessage = isRu
      ? 'Произошла ошибка при запуске поиска конкурентов. Пожалуйста, попробуйте позже.'
      : 'An error occurred while starting competitor search. Please try again later.'

    console.log('🔥 [DEBUG] About to send error message to user:', errorMessage)

    try {
      if (ctx.reply) {
        await ctx.reply(errorMessage)
        logger.info('✅ [Instagram Scraper] Error message sent to user', { telegram_id })
      }
    } catch (replyError) {
      logger.error('❌ [Instagram Scraper] Failed to send error message to user', {
        replyError: replyError instanceof Error ? replyError.message : 'Unknown error',
        telegram_id
      })
    }

    return {
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
