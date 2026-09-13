import { isDev } from './config'
import { ADMIN_IDS_ARRAY } from '@/config'
import { scrubbedLog } from '@/utils/scrubCallbackSecrets'
import { webhookSecretFor } from '@/utils/webhookSecret'
import { logger } from '@/utils/enhancedLogger'
import { setupSafeConsoleLogging } from './utils/logger'

// Активируем безопасное логирование для предотвращения вывода Buffer данных
// Test CI/CD pipeline: проверка работы автоматической сборки после очистки веток
setupSafeConsoleLogging()

logger.debug(`--- Bot Logic ---`)
logger.debug(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
logger.debug(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
logger.debug(`--- End Bot Logic Check ---`)

import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update, BotCommand } from 'telegraf/types'
import { registerCommands, createStage } from './navigation'
import { MyContext } from './interfaces'
import { sessionMiddleware } from './core/session/sessionStore'
import {
  handleSuccessfulPayment,
  handlePreCheckoutQuery,
} from './handlers/paymentHandlers'
import { setBotCommands } from './setCommands'
// ✅ ДОБАВЛЯЕМ IMPORT LANGUAGE MIDDLEWARE
import { languageMiddleware } from './middlewares/languageMiddleware'
// ✅ ДОБАВЛЯЕМ IMPORT ОБРАБОТЧИКА ОШИБОК
import { setupErrorHandler } from './helpers/error/errorHandler'

// ✅ ДОБАВЛЯЕМ IMPORT ОБРАБОТЧИКА УВЕДОМЛЕНИЙ
import { setupNotificationProcessor } from './handlers/notificationHandler'

// ✅ ЦЕНТРАЛИЗОВАННЫЙ ОБРАБОТЧИК ОТМЕНЫ
import { createGlobalCancelHandler } from './utils/cancelHandler'

// Импорт новой команды
import { setupStatsCommand } from './commands/statsCommand'

import { handleTextMessage } from './handlers/handleTextMessage'
import { message } from 'telegraf/filters'

// Импортируем наш API сервер из новой директории
import { startApiServer } from './api_server'

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []

// Define the commands for private chats
// const privateCommands: BotCommand[] = [
//   { command: 'start', description: '🚀 Начать / Restart' },
//   { command: 'menu', description: '🏠 Главное меню / Main Menu' },
//   { command: 'support', description: '💬 Техподдержка / Support' },
// ]

// Функция для проверки валидности токена
export async function validateBotToken(token: string): Promise<boolean> {
  try {
    const bot = new Telegraf(token)
    await bot.telegram.getMe()
    return true
  } catch (error) {
    logger.error(`❌ Ошибка валидации токена: ${(error as Error).message}`)
    return false
  }
}

// Функция для проверки занятости порта
export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const net = await import('net')
    return new Promise(resolve => {
      const server = net.createServer()
      server.once('error', () => resolve(true))
      server.once('listening', () => {
        server.close()
        resolve(false)
      })
      server.listen(port)
    })
  } catch (error) {
    logger.error(`❌ Ошибка проверки порта ${port}:`, error)
    return true
  }
}

// Добавляю логи перед инициализацией ботов
async function initializeBots() {
  const stage = createStage()

  if (isDev) {
    // В режиме разработки запускаем бота, указанного в TEST_BOT_NAME
    const targetBotUsername = process.env.TEST_BOT_NAME
    if (!targetBotUsername) {
      throw new Error(
        '❌ Переменная окружения TEST_BOT_NAME не установлена. Укажите username бота для запуска в development.'
      )
    }

    logger.debug(`🔧 Ищем тестового бота с username: ${targetBotUsername}`)

    // Собираем все потенциальные токены из env
    const potentialTokens = Object.entries(process.env)
      .filter(([key]) => key.startsWith('BOT_TOKEN'))
      .map(([, value]) => value)
      .filter(Boolean) as string[]

    let bot: Telegraf<MyContext> | null = null
    let foundBotInfo: Awaited<
      ReturnType<Telegraf<MyContext>['telegram']['getMe']>
    > | null = null

    for (const token of potentialTokens) {
      try {
        const tempBot = new Telegraf<MyContext>(token, {
          handlerTimeout: Infinity,
        })
        const botInfo = await tempBot.telegram.getMe()
        if (botInfo.username === targetBotUsername) {
          logger.debug(`✅ Найден бот ${botInfo.username}`)
          bot = tempBot // Используем этого бота
          foundBotInfo = botInfo
          break // Прерываем цикл, бот найден
        }
      } catch (error) {
        // Игнорируем ошибки валидации токенов, просто ищем дальше
        // logger.warn(`⚠️ Ошибка проверки токена ${token.substring(0, 10)}...: ${error.message}`);
      }
    }

    if (!bot || !foundBotInfo) {
      throw new Error(
        `❌ Бот с username '${targetBotUsername}' не найден среди токенов в .env или токен невалиден.`
      )
    }

    // Добавляем логи перед регистрацией команд
    logger.debug(
      '🔄 [SCENE_DEBUG] Регистрация команд бота и stage middleware...'
    )
    //
    // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
    bot.use(sessionMiddleware()) // 1. Session: Redis-backed when REDIS_URL is set (survives redeploys)
    bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!
    bot.use(Telegraf.log(scrubbedLog)) // 3. Log all Telegraf updates and middleware flow

    // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
    setupErrorHandler(bot)

    // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
    setupNotificationProcessor(bot)

    registerCommands({ bot }) // 4. Сцены и команды (включая stage.middleware() и hears обработчики)
    // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
    setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
    // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
    bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
    bot.on('successful_payment', handleSuccessfulPayment as any)
    // Обработчик текстовых сообщений по умолчанию - должен быть последним
    // ВРЕМЕННО ОТКЛЮЧЕН: handleTextMessage - он мешает работе wizard сцен
    // bot.on(message('text'), handleTextMessage)
    // <<<---------------------------------------------------->>>

    // Используем импортированную функцию setBotCommands
    await setBotCommands(bot)

    botInstances.push(bot)
    // Используем уже полученную информацию о боте
    logger.debug(`🤖 Тестовый бот ${foundBotInfo.username} инициализирован`)

    // 🔧 FIX 409: Очистка webhook перед polling в dev режиме
    try {
      const webhookInfo = await bot.telegram.getWebhookInfo()
      if (webhookInfo.url) {
        logger.debug(
          `🔌 [WEBHOOK] Обнаружен активный вебхук для ${foundBotInfo.username}: ${webhookInfo.url}. Удаляю...`
        )
        await bot.telegram.deleteWebhook({ drop_pending_updates: true })
        logger.debug('✅ [WEBHOOK] Вебхук удалён, переходим к polling')
      } else {
        logger.debug(
          '🟢 [WEBHOOK] Активного вебхука нет, можно запускать polling'
        )
      }
    } catch (error) {
      logger.warn(
        '⚠️ [WEBHOOK] Не удалось получить/удалить вебхук:',
        String(error)
      )
    }

    // В режиме разработки используем polling
    await bot.launch({
      allowedUpdates: [
        'message',
        'callback_query',
        'pre_checkout_query' as any,
        'successful_payment' as any,
        'business_connection' as any,
        'business_message' as any,
        'inline_query',
      ],
    })
    logger.debug(
      `🚀 Тестовый бот ${foundBotInfo.username} запущен в режиме разработки`
    )
  } else {
    // В продакшене используем все активные боты
    const botTokens = [
      process.env.BOT_TOKEN_1,
      process.env.BOT_TOKEN_2,
      process.env.BOT_TOKEN_3,
      process.env.BOT_TOKEN_4,
      process.env.BOT_TOKEN_5,
      process.env.BOT_TOKEN_6,
      process.env.BOT_TOKEN_7,
      process.env.BOT_TOKEN_8,
      process.env.BOT_TOKEN_9,
      process.env.BOT_TOKEN_10,
    ].filter((token): token is string => Boolean(token))

    let currentPort = 3001

    for (const token of botTokens) {
      if (await validateBotToken(token)) {
        const bot = new Telegraf<MyContext>(token, {
          handlerTimeout: Infinity,
        })
        bot.use(Telegraf.log(scrubbedLog)) // Log all Telegraf updates and middleware flow

        // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
        bot.use(sessionMiddleware()) // 1. Session: Redis-backed when REDIS_URL is set (survives redeploys)
        bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
        setupErrorHandler(bot)

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
        setupNotificationProcessor(bot)

        registerCommands({ bot }) // 3. Сцены и команды (включая stage.middleware() и hears обработчики)
        // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
        setupStatsCommand(bot) // <--- НОВАЯ СТРОКА

        // ✅ ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ОТМЕНЫ - перехватывает ВСЕ команды отмены
        bot.action(
          /^cancel.*/,
          createGlobalCancelHandler({
            messageRu: '❌ Операция отменена. Возвращаю в главное меню.',
            messageEn: '❌ Operation cancelled. Returning to main menu.',
          })
        )

        // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
        bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
        bot.on('successful_payment', handleSuccessfulPayment as any)
        // Обработчик текстовых сообщений по умолчанию - должен быть последним
        // ВРЕМЕННО ОТКЛЮЧЕН: handleTextMessage - он мешает работе wizard сцен
        // bot.on(message('text'), handleTextMessage)
        // <<<---------------------------------------------------->>>

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        logger.debug(`🤖 Бот ${botInfo.username} инициализирован`)

        // Используем импортированную функцию setBotCommands
        await setBotCommands(bot)

        // Запускаем webhook для каждого бота
        // Старый блок установки команд ниже должен быть полностью удален

        // webhook settings
        // ... existing code ...

        while (await isPortInUse(currentPort)) {
          logger.debug(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        logger.debug(
          `🔌 Используем порт ${currentPort} для бота ${botInfo.username}`
        )

        const webhookDomain = process.env.WEBHOOK_DOMAIN
        const usePolling = process.env.USE_POLLING === 'true'

        if (usePolling || !webhookDomain) {
          // Используем polling режим
          logger.debug(`🔄 Запуск бота ${botInfo.username} в polling режиме`)
          // drop_pending_updates, like the dev path above does at the top of
          // this file for the same situation.
          //
          // Without it, everything Telegram queued while the webhook endpoint
          // was unreachable is delivered to the poller the moment the bot comes
          // back. Those are real user commands, and they reach scene handlers
          // that charge for generation -- a backlog replay during an incident
          // is precisely when a storm of paid commands is least wanted.
          //
          // The two sites disagreed while intending the same thing: the dev
          // path drops, this one did not, and this one is the production path.
          await bot.telegram.deleteWebhook({ drop_pending_updates: true })
          bot.launch({
            allowedUpdates: [
              'message',
              'callback_query',
              'pre_checkout_query' as any,
              'successful_payment' as any,
              'business_connection' as any,
              'business_message' as any,
              'inline_query',
            ],
          })
          logger.debug(`🚀 Бот ${botInfo.username} запущен в polling режиме`)
        } else {
          // Используем webhook режим
          logger.debug(`🔗 Запуск бота ${botInfo.username} в webhook режиме`)

          // Формируем правильный путь для вебхука, используя имя бота
          const webhookPath = `/${botInfo.username}` // Используем имя бота как путь

          bot.launch({
            webhook: {
              domain: webhookDomain,
              port: currentPort,
              hookPath: webhookPath, // Используем hookPath, как было раньше
              // Without this the endpoint is protected only by the secrecy of
              // its URL, and the URL is the bot's public @name under a known
              // domain. Telegraf both sends this to setWebhook and REJECTS a
              // delivery whose X-Telegram-Bot-Api-Secret-Token does not match,
              // so one option closes both ends.
              secretToken: webhookSecretFor(token), // secret-guard-ok: derived, not a literal
            },
            allowedUpdates: [
              'message',
              'callback_query',
              'pre_checkout_query' as any,
              'successful_payment' as any,
              'business_connection' as any,
              'business_message' as any,
              'inline_query',
            ],
          })
          logger.debug(
            `🚀 Бот ${botInfo.username} запущен в webhook режиме на порту ${currentPort}`
          )

          await new Promise(resolve => setTimeout(resolve, 2000))
          currentPort++
        }
      }
    }
  }

  logger.debug('🔍 Инициализация сцен...')
  // Перед регистрацией каждой сцены добавляю лог
  logger.debug('📋 Регистрация сцены: payment_scene')
  // ... существующий код регистрации сцен ...

  // После регистрации всех сцен добавляю итоговый лог:
  logger.debug('✅ Все сцены успешно зарегистрированы')

  // ✅ ИНИЦИАЛИЗАЦИЯ АСИНХРОННОГО LIPSYNC МЕНЕДЖЕРА
  try {
    const { asyncLipSyncManager } = await import(
      './core/lipsync/async-lipsync-manager'
    )

    // Устанавливаем первый бот как основной для отправки сообщений
    if (botInstances.length > 0) {
      asyncLipSyncManager.setBotInstance(botInstances[0])
      /*
       * The seller that works without being asked: one agent turn for the
       * owner every N minutes, a card in the owner's chat when it prepares
       * something. CRM_PROACTIVE_MINUTES=0 switches it off; CRM_PROACTIVE_BOT
       * names the bot whose chat the owner actually uses (a bot cannot open
       * a chat with a person who never started it).
       */
      const proactiveMinutes = Number(process.env.CRM_PROACTIVE_MINUTES ?? '30')
      if (proactiveMinutes > 0) {
        const wanted = (process.env.CRM_PROACTIVE_BOT || '').replace(/^@/, '')
        const carrier =
          botInstances.find(b => b.botInfo?.username === wanted) ??
          botInstances[0]
        const { startCrmProactive, setCrmCarrier, sweepDriver } = await import(
          '@/services/crmProactive'
        )
        const ownerId =
          process.env.CRM_PROACTIVE_OWNER ||
          String(ADMIN_IDS_ARRAY[0] || '144022504')
        setCrmCarrier(carrier, { ownerId })
        if (sweepDriver() === 'timer') {
          startCrmProactive(carrier, {
            ownerId,
            everyMs: proactiveMinutes * 60_000,
          })
        }
      }
      logger.info('✅ Асинхронный LipSync менеджер инициализирован')
    }
  } catch (error) {
    logger.error(
      '❌ Ошибка инициализации асинхронного LipSync менеджера:',
      error
    )
  }
}

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  logger.debug(`🚨 Получен сигнал ${signal}. Завершение работы...`)
  for (const bot of botInstances) {
    logger.debug(`🚫 Остановка бота ${bot.botInfo?.username}...`)
    await bot.stop()
  }
  process.exit(0)
}

// Ловим сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

logger.debug('🏁 Запуск приложения')

// Запускаем API сервер
// Это будет выполнено при старте src/bot.ts
startApiServer()

// Возвращаем корректный запуск инициализации ботов
initializeBots()
  .then(() => {
    logger.debug('✅ Боты и API сервер успешно запущены') // Обновим сообщение
  })
  .catch(error => {
    logger.error(
      '❌ Ошибка при инициализации приложения (боты или API сервер):',
      error
    )
    process.exit(1)
  })
