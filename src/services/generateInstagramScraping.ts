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
  max_users: number = 50,
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
    max_users,
    max_reels_per_user,
    scrape_reels,
    telegram_id,
    botName,
  })

  await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

  try {
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
    }

    // 🚀 Отправляем событие в Inngest через SDK (работает и в dev, и в production!)
    console.log(
      `📤 [${process.env.NODE_ENV?.toUpperCase()}] Отправляем событие через Inngest SDK...`
    )

    await inngest.send({
      name: 'instagram/scraper-v2',
      data: eventData,
      user: {
        external_id: telegram_id, // Для отслеживания пользователя (шифруется)
      },
      // ID для дедупликации - избегаем повторных запусков
      id: `instagram-scraper-${telegram_id}-${username_or_id}-${Date.now()}`,
    })

    console.log(
      `✅ [${process.env.NODE_ENV?.toUpperCase()}] Event sent via SDK to:`,
      process.env.NODE_ENV === 'development'
        ? 'localhost:8288'
        : 'ai-server-u14194.vm.elestio.app/api/inngest'
    )

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
    logger.error({
      message: '❌ [Instagram Scraper] Ошибка при отправке события в Inngest',
      description: 'Error sending event to Inngest',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })

    const errorMessage = isRu
      ? 'Произошла ошибка при запуске поиска конкурентов. Пожалуйста, попробуйте позже.'
      : 'An error occurred while starting competitor search. Please try again later.'

    if (ctx.reply) {
      await ctx.reply(errorMessage)
    }

    return {
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
