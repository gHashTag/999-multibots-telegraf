import axios from 'axios'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

interface DirectParsingOptions {
  username: string
  projectId: number
  maxUsers?: number
  scrapeReels?: boolean
  maxReelsPerUser?: number
}

export async function startDirectInstagramParsing(
  ctx: MyContext,
  options: DirectParsingOptions
): Promise<boolean> {
  const {
    username,
    projectId,
    maxUsers = 50,
    scrapeReels = false,
    maxReelsPerUser = 50
  } = options

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id?.toString()
  
  if (!telegramId) {
    await ctx.reply(
      isRu 
        ? '❌ Ошибка: не удалось определить ваш Telegram ID'
        : '❌ Error: unable to determine your Telegram ID'
    )
    return false
  }

  try {
    // Определяем URL API сервера
    const apiUrl = process.env.NODE_ENV === 'production' 
      ? 'https://ai-server-u14194.vm.elestio.app' 
      : 'http://localhost:2999'

    logger.info('[Direct Instagram Parsing] Starting parsing via API', {
      username,
      projectId,
      maxUsers,
      scrapeReels,
      telegramId,
      apiUrl
    })

    // Отправляем запрос на API
    const response = await axios.post(`${apiUrl}/api/instagram/parse`, {
      username_or_id: username,
      project_id: projectId,
      max_users: maxUsers,
      max_reels_per_user: maxReelsPerUser,
      scrape_reels: scrapeReels,
      requester_telegram_id: telegramId,
      bot_name: 'telegram_bot'
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (response.data.success) {
      logger.info('[Direct Instagram Parsing] API request successful', {
        username,
        projectId,
        response: response.data
      })

      // Отправляем сообщение пользователю
      await ctx.reply(response.data.message, { parse_mode: 'Markdown' })
      
      return true
    } else {
      logger.error('[Direct Instagram Parsing] API returned error', {
        username,
        projectId,
        error: response.data.error
      })

      await ctx.reply(
        isRu
          ? `❌ Ошибка запуска анализа: ${response.data.error}`
          : `❌ Error starting analysis: ${response.data.error}`
      )
      
      return false
    }

  } catch (error) {
    logger.error('[Direct Instagram Parsing] Request failed', {
      username,
      projectId,
      error: error instanceof Error ? error.message : String(error)
    })

    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error || error.message
      
      await ctx.reply(
        isRu
          ? `❌ Ошибка соединения с API: ${errorMessage}`
          : `❌ API connection error: ${errorMessage}`
      )
    } else {
      await ctx.reply(
        isRu
          ? '❌ Произошла неожиданная ошибка при запуске анализа'
          : '❌ An unexpected error occurred while starting the analysis'
      )
    }

    return false
  }
}

// Функция для быстрого тестирования парсинга
export async function quickInstagramTest(
  ctx: MyContext,
  username: string = 'neuro_sage'
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  
  await ctx.reply(
    isRu
      ? `🧪 Запускаем быстрый тест парсинга Instagram для @${username}`
      : `🧪 Starting quick Instagram parsing test for @${username}`
  )

  // Используем первый доступный проект (ID 1 - Coco Age)
  const result = await startDirectInstagramParsing(ctx, {
    username,
    projectId: 1, // Coco Age project
    maxUsers: 10,
    scrapeReels: false
  })

  if (result) {
    await ctx.reply(
      isRu
        ? '✅ Тестовый парсинг запущен успешно!'
        : '✅ Test parsing started successfully!'
    )
  } else {
    await ctx.reply(
      isRu
        ? '❌ Тестовый парсинг не удался'
        : '❌ Test parsing failed'
    )
  }
}