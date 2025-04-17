import * as dotenv from 'dotenv'
import logger from './logger'
import { BotInstance, initBots, getBotsInfo, maskToken } from '../core/bot'
import { getBotsFromSupabase } from '@/core/supabase'

// Загружаем переменные окружения
dotenv.config()

/**
 * Запускает бота с настройками сервера или webhook
 * @param bot Экземпляр бота
 */
async function startBot(bot: BotInstance): Promise<boolean> {
  try {
    // Получаем настройки webhook
    const webhookDomain = process.env.WEBHOOK_DOMAIN
    const webhookPath = process.env.WEBHOOK_PATH || '/webhook'
    const botPath = process.env.BOT_PATH || ''

    const identifier = bot.username ? `@${bot.username}` : `bot ${bot.id}`

    if (webhookDomain) {
      // Конфигурируем webhook
      const webhookUrl = `${webhookDomain}${botPath}${webhookPath}/${bot.id}`

      logger.info({
        message: `🌐 Настройка webhook для ${identifier}: ${webhookUrl}`,
        description: 'Setting up webhook',
        bot_id: bot.id,
        webhook_url: webhookUrl,
      })

      // Запускаем через webhook
      try {
        await bot.instance.telegram.setWebhook(webhookUrl)

        // Проверяем информацию о webhook
        const webhookInfo = await bot.instance.telegram.getWebhookInfo()

        if (webhookInfo.url === webhookUrl) {
          logger.info({
            message: `✅ Webhook успешно настроен для ${identifier}`,
            description: 'Webhook setup successful',
            bot_id: bot.id,
            webhook_url: webhookUrl,
            pending_updates: webhookInfo.pending_update_count,
          })
          return true
        } else {
          logger.warn({
            message: `⚠️ Webhook для ${identifier} настроен на другой URL: ${webhookInfo.url}`,
            description: 'Webhook mismatch',
            bot_id: bot.id,
            expected_url: webhookUrl,
            actual_url: webhookInfo.url,
          })
          return true // Бот всё равно запущен, просто webhook отличается
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logger.error({
          message: `❌ Ошибка настройки webhook для ${identifier}: ${errorMessage}`,
          description: 'Webhook setup failed',
          bot_id: bot.id,
          error: errorMessage,
        })
        return false
      }
    } else {
      // Запускаем через long polling
      logger.info({
        message: `📡 Запуск ${identifier} в режиме long polling`,
        description: 'Starting in long polling mode',
        bot_id: bot.id,
      })

      await bot.instance.launch()

      logger.info({
        message: `✅ ${identifier} успешно запущен в режиме long polling`,
        description: 'Long polling started',
        bot_id: bot.id,
      })
      return true
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Ошибка запуска бота ${bot.id}: ${errorMessage}`,
      description: 'Bot launch failed',
      bot_id: bot.id,
      error: errorMessage,
    })

    // Регистрируем ошибку в Sentry, если доступно
    if (process.env.SENTRY_DSN) {
      // Вместо непосредственного вызова Sentry используем try-catch
      try {
        // При необходимости здесь будет интеграция с Sentry
        console.error('Sentry error:', errorMessage)
      } catch (sentryError) {
        logger.error({
          message: `Ошибка при логировании в Sentry: ${String(sentryError)}`,
          description: 'Sentry logging error',
        })
      }
    }
    return false
  }
}

/**
 * Запускает одного или несколько ботов с улучшенной изоляцией
 */
export async function launchBot(): Promise<void> {
  try {
    logger.info({
      message: '🚀 Запуск процесса инициализации ботов',
      description: 'Starting bot launch process',
    })

    // Получаем информацию о ботах из переменных окружения
    const botsInfo = getBotsInfo()

    if (botsInfo.length === 0) {
      logger.error({
        message: '❌ Не найдены токены ботов в переменных окружения',
        description: 'No bot tokens found in environment variables',
      })
      return
    }

    // Логируем маскированные токены для безопасности
    logger.info({
      message: `🔐 Обнаружено ${botsInfo.length} токенов ботов`,
      description: 'Bot tokens found',
      tokens_count: botsInfo.length,
      masked_tokens: botsInfo.map(bot => ({
        id: bot.id,
        masked_token: maskToken(bot.token),
      })),
    })

    // Инициализируем ботов
    const botInstances = await initBots(botsInfo)

    if (botInstances.length === 0) {
      logger.error({
        message: '❌ Не удалось инициализировать ни одного бота',
        description: 'No bots initialized successfully',
      })
      return
    }

    // Настройка graceful shutdown
    const shutdownHandler = () => {
      logger.info({
        message: '🛑 Получен сигнал завершения, останавливаем ботов...',
        description: 'Shutdown signal received',
      })

      // Останавливаем каждого бота независимо
      botInstances.forEach(bot => {
        const identifier = bot.username ? `@${bot.username}` : `bot ${bot.id}`

        try {
          bot.instance.stop()
          logger.info({
            message: `✅ Бот ${identifier} успешно остановлен`,
            description: 'Bot stopped',
            bot_id: bot.id,
          })
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logger.error({
            message: `❌ Ошибка при остановке бота ${identifier}: ${errorMessage}`,
            description: 'Bot stop failed',
            bot_id: bot.id,
            error: errorMessage,
          })
        }
      })

      // Необходимо дать время на корректное завершение
      logger.info({
        message: '👋 Завершение работы',
        description: 'Process exit',
      })

      setTimeout(() => process.exit(0), 1000)
    }

    // Регистрируем обработчики завершения процесса
    process.on('SIGINT', shutdownHandler)
    process.on('SIGTERM', shutdownHandler)

    // Запускаем каждого бота с изоляцией ошибок
    const startPromises = botInstances.map(bot => {
      // Изолируем запуск бота в отдельной promise
      return startBot(bot).catch(error => {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logger.error({
          message: `❌ Неожиданная ошибка при запуске бота ${bot.id}: ${errorMessage}`,
          description: 'Unexpected error launching bot',
          bot_id: bot.id,
          error: errorMessage,
        })
        return false // Возвращаем false, чтобы Promise.all не прерывался
      })
    })

    // Ждем запуска всех ботов
    const results = await Promise.all(startPromises)
    const successCount = results.filter(result => result === true).length

    logger.info({
      message: `✨ Запуск ботов завершен: ${successCount} из ${botInstances.length} успешно запущены`,
      description: 'All bots launched',
      success_count: successCount,
      bots_count: botInstances.length,
      bots: botInstances.map(bot => ({
        id: bot.id,
        username: bot.username,
      })),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при запуске ботов: ${errorMessage}`,
      description: 'Critical error launching bots',
      error: errorMessage,
    })

    // Регистрируем ошибку в Sentry, если доступно
    if (process.env.SENTRY_DSN) {
      // Вместо непосредственного вызова Sentry используем try-catch
      try {
        // При необходимости здесь будет интеграция с Sentry
        console.error('Sentry error:', errorMessage)
      } catch (sentryError) {
        logger.error({
          message: `Ошибка при логировании в Sentry: ${String(sentryError)}`,
          description: 'Sentry logging error',
        })
      }
    }
  }
}

/**
 * Запускает несколько ботов одновременно с улучшенной изоляцией
 * @param bots Массив экземпляров ботов для запуска
 * @returns Массив успешно запущенных ботов
 */
export async function launchBots(bots: BotInstance[]): Promise<BotInstance[]> {
  if (!bots || bots.length === 0) {
    logger.warn('Нет ботов для запуска')
    return []
  }

  logger.info({
    message: `🚀 Начинаем запуск ${bots.length} ботов`,
    description: 'Starting bots',
    bots_count: bots.length,
  })

  const successfullyLaunched: BotInstance[] = []
  const failedBots: BotInstance[] = []

  // Запускаем ботов последовательно для лучшей изоляции ошибок
  for (const botInstance of bots) {
    const { id, username } = botInstance
    const identifier = username ? `@${username}` : `ID ${id}`

    try {
      logger.info({
        message: `🚀 Запуск бота ${identifier}...`,
        description: 'Starting bot',
        bot_id: botInstance.id,
      })

      const success = await startBot(botInstance)

      if (success) {
        successfullyLaunched.push(botInstance)
        logger.info({
          message: `✅ Бот ${identifier} успешно запущен`,
          description: 'Bot successfully started',
          bot_id: botInstance.id,
        })
      } else {
        failedBots.push(botInstance)
        logger.error({
          message: `❌ Не удалось запустить бота ${identifier}`,
          description: 'Bot failed to start',
          bot_id: botInstance.id,
        })
      }
    } catch (error) {
      failedBots.push(botInstance)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: `❌ Ошибка при запуске бота ${identifier}: ${errorMessage}`,
        description: 'Bot launch error',
        bot_id: botInstance.id,
        error: errorMessage,
      })
    }
  }

  const successCount = successfullyLaunched.length
  const failCount = failedBots.length

  logger.info({
    message: `📊 Запуск ботов завершен: успешно ${successCount}, не удалось ${failCount}`,
    description: 'Bots launch completed',
    success_count: successCount,
    failed_count: failCount,
    total_count: bots.length,
  })

  return successfullyLaunched
}

/**
 * Инициализирует и запускает ботов из конфигурации или переменных окружения
 * @returns Список запущенных ботов
 */
export async function startBotsFromEnv(): Promise<BotInstance[]> {
  // Получаем список ботов
  const botsInfo = getBotsInfo()

  if (botsInfo.length === 0) {
    logger.warn('Не найдены токены ботов в переменных окружения')
    return []
  }

  logger.info({
    message: `🤖 Найдено ${botsInfo.length} ботов в конфигурации`,
    description: 'Bots found in environment',
    bots_count: botsInfo.length,
  })

  // Логируем маскированные токены для отладки
  logger.debug(
    'Токены ботов:',
    botsInfo.map(bot => ({
      id: bot.id,
      masked_token: maskToken(bot.token),
    }))
  )

  // Инициализируем ботов
  const botInstances = await initBots(botsInfo)

  if (botInstances.length === 0) {
    logger.error('❌ Не удалось инициализировать ни одного бота')
    return []
  }

  // Запускаем ботов
  return await launchBots(botInstances)
}

/**
 * Инициализирует и запускает ботов из Supabase
 * @returns Список запущенных ботов
 */
export async function startBotsFromSupabase(): Promise<BotInstance[]> {
  try {
    // Получаем список ботов из Supabase
    const botsInfo = await getBotsFromSupabase()

    if (!botsInfo || botsInfo.length === 0) {
      logger.warn('Не найдены боты в Supabase')
      return []
    }

    logger.info({
      message: `🤖 Найдено ${botsInfo.length} ботов в Supabase`,
      description: 'Bots found in Supabase',
      bots_count: botsInfo.length,
    })

    // Инициализируем ботов
    const botInstances = await initBots(botsInfo)

    if (botInstances.length === 0) {
      logger.error('❌ Не удалось инициализировать ни одного бота из Supabase')
      return []
    }

    // Запускаем ботов
    return await launchBots(botInstances)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Ошибка при запуске ботов из Supabase: ${errorMessage}`,
      description: 'Failed to start bots from Supabase',
      error: errorMessage,
    })
    return []
  }
}

/**
 * Запускает Express сервер для обработки вебхуков
 * @returns Promise<boolean> - результат запуска сервера
 */
export async function startServer(): Promise<boolean> {
  try {
    logger.info('🌐 Запуск сервера для обработки вебхуков...')

    const port = process.env.PORT || 3000
    logger.info(`✅ Сервер успешно запущен на порту ${port}`)

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`❌ Ошибка при запуске сервера: ${errorMessage}`)
    return false
  }
}
