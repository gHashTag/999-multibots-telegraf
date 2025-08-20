import { inngest } from '@/inngest_app/client'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'

export interface InstagramScrapingParams {
  username_or_id: string
  project_id: number
  max_users?: number
  max_reels_per_user?: number
  scrape_reels?: boolean
  requester_telegram_id: string
  bot_name?: string
}

export interface InstagramScrapingResponse {
  success: boolean
  eventId?: string
  message: string
  error?: string
}

/**
 * 🔍 Универсальная функция для запуска парсинга Instagram конкурентов
 * Интегрируется с существующей Inngest системой на продакшн сервере
 */
export async function startInstagramScraping(
  params: InstagramScrapingParams,
  ctx: MyContext
): Promise<InstagramScrapingResponse> {
  const {
    username_or_id,
    project_id,
    max_users = 50,
    max_reels_per_user = 50,
    scrape_reels = false,
    requester_telegram_id,
    bot_name
  } = params

  const isRu = isRussianFromState(ctx)

  logger.info('[Instagram Scraping Service] Starting Instagram competitor analysis', {
    username_or_id,
    project_id,
    max_users,
    max_reels_per_user,
    scrape_reels,
    requester_telegram_id,
    bot_name
  })

  try {
    // Валидация входных параметров
    if (!username_or_id || username_or_id.trim().length === 0) {
      throw new Error('Username or ID is required')
    }

    if (!project_id || project_id <= 0) {
      throw new Error('Valid project ID is required')
    }

    if (!requester_telegram_id) {
      throw new Error('Requester Telegram ID is required')
    }

    // Валидация Instagram username
    const cleanUsername = username_or_id.trim().replace('@', '')
    const instagramUsernameRegex = /^[a-zA-Z0-9._]{1,30}$/
    if (!instagramUsernameRegex.test(cleanUsername)) {
      throw new Error('Invalid Instagram username format')
    }

    // Валидация параметров
    if (max_users < 1 || max_users > 100) {
      throw new Error('Max users must be between 1 and 100')
    }

    if (max_reels_per_user < 1 || max_reels_per_user > 200) {
      throw new Error('Max reels per user must be between 1 and 200')
    }

    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

    // Подготовка данных для отправки в Inngest
    const debugSessionId = `instagram-${Date.now()}`
    const eventData = {
      username_or_id: cleanUsername,
      project_id,
      max_users,
      max_reels_per_user,
      scrape_reels,
      requester_telegram_id,
      bot_name: bot_name || 'default_bot',
      
      // Дополнительные метаданные
      username: ctx.from?.username,
      language: isRu ? 'ru' : 'en',
      timestamp: new Date().toISOString(),
      debug_source: 'telegram-bot-instagram-service',
      debug_session_id: debugSessionId
    }

    logger.info('[Instagram Scraping Service] Sending event to Inngest', {
      eventData,
      debugSessionId
    })

    // 🚀 Отправляем событие в Inngest (работает с существующей системой)
    const inngestResult = await inngest.send({
      name: 'instagram/scraper-v2',
      data: eventData,
      user: {
        external_id: requester_telegram_id
      },
      id: `instagram-scraper-${requester_telegram_id}-${cleanUsername}-${Date.now()}`
    })

    logger.info('[Instagram Scraping Service] Event sent successfully to Inngest', {
      inngestResult,
      debugSessionId
    })

    const successMessage = isRu
      ? `🚀 Анализ конкурентов Instagram запущен!

👤 **Целевой аккаунт:** @${cleanUsername}
📊 **Анализ до:** ${max_users} конкурентов
🎬 **Рилсы:** ${scrape_reels ? `✅ До ${max_reels_per_user} на конкурента` : '❌ Без рилсов'}
📁 **Проект ID:** ${project_id}

⏰ **Время обработки:** 5-15 минут
📬 **Уведомления:** Отправим результаты автоматически

🔍 **Session ID:** \`${debugSessionId}\`
💡 Вы можете продолжить использовать бота`
      : `🚀 Instagram Competitor Analysis Started!

👤 **Target Account:** @${cleanUsername}
📊 **Analyzing up to:** ${max_users} competitors
🎬 **Reels:** ${scrape_reels ? `✅ Up to ${max_reels_per_user} per competitor` : '❌ No reels'}
📁 **Project ID:** ${project_id}

⏰ **Processing Time:** 5-15 minutes
📬 **Notifications:** We'll send results automatically

🔍 **Session ID:** \`${debugSessionId}\`
💡 You can continue using the bot`

    return {
      success: true,
      eventId: debugSessionId,
      message: successMessage
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('[Instagram Scraping Service] Error starting Instagram scraping', {
      error: errorMessage,
      params,
      stack: error instanceof Error ? error.stack : undefined
    })

    const userErrorMessage = isRu
      ? `❌ Ошибка при запуске анализа конкурентов

**Причина:** ${errorMessage}

💭 Проверьте правильность данных:
• Instagram username без @ (например: neuro_sage)
• ID проекта должен быть положительным числом
• Количество конкурентов: 1-100
• Количество рилсов: 1-200

🔄 Попробуйте еще раз или обратитесь в поддержку.`
      : `❌ Error Starting Competitor Analysis

**Reason:** ${errorMessage}

💭 Please check your input:
• Instagram username without @ (example: neuro_sage)
• Project ID must be a positive number
• Competitors count: 1-100
• Reels count: 1-200

🔄 Please try again or contact support.`

    return {
      success: false,
      message: userErrorMessage,
      error: errorMessage
    }
  }
}

/**
 * 📋 Получение подписок конкурентов (заглушка для будущей интеграции)
 * TODO: Интегрировать с БД когда API endpoints будут развернуты
 */
export async function getCompetitorSubscriptions(
  userTelegramId: string,
  botName: string
): Promise<any[]> {
  logger.info('[Instagram Scraping Service] Getting competitor subscriptions (stub)', {
    userTelegramId,
    botName
  })

  // TODO: Интегрировать с реальной БД
  return []
}

/**
 * ➕ Создание подписки на конкурента (заглушка для будущей интеграции)
 * TODO: Интегрировать с БД когда API endpoints будут развернуты
 */
export async function createCompetitorSubscription(
  userTelegramId: string,
  botName: string,
  competitorUsername: string,
  options: {
    maxReels?: number
    minViews?: number
    maxAgeDays?: number
    deliveryFormat?: 'digest' | 'individual' | 'archive'
  } = {}
): Promise<{ success: boolean; message: string }> {
  logger.info('[Instagram Scraping Service] Creating competitor subscription (stub)', {
    userTelegramId,
    botName,
    competitorUsername,
    options
  })

  // TODO: Интегрировать с реальной БД
  return {
    success: true,
    message: 'Subscription functionality will be available when API endpoints are deployed'
  }
}

/**
 * 🔍 Валидация Instagram username
 */
export function validateInstagramUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false
  }
  
  const cleanUsername = username.trim().replace('@', '')
  const instagramUsernameRegex = /^[a-zA-Z0-9._]{1,30}$/
  
  return instagramUsernameRegex.test(cleanUsername)
}

/**
 * 📊 Валидация параметров парсинга
 */
export function validateScrapingParams(params: Partial<InstagramScrapingParams>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!params.username_or_id) {
    errors.push('Username or ID is required')
  } else if (!validateInstagramUsername(params.username_or_id)) {
    errors.push('Invalid Instagram username format')
  }

  if (!params.project_id || params.project_id <= 0) {
    errors.push('Valid project ID is required')
  }

  if (!params.requester_telegram_id) {
    errors.push('Requester Telegram ID is required')
  }

  if (params.max_users && (params.max_users < 1 || params.max_users > 100)) {
    errors.push('Max users must be between 1 and 100')
  }

  if (params.max_reels_per_user && (params.max_reels_per_user < 1 || params.max_reels_per_user > 200)) {
    errors.push('Max reels per user must be between 1 and 200')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}