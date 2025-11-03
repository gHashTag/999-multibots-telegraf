import { isDev } from './config'
import { setupSafeConsoleLogging } from './utils/logger'

// Активируем безопасное логирование для предотвращения вывода Buffer данных
// Test CI/CD pipeline: проверка работы автоматической сборки после очистки веток
setupSafeConsoleLogging()

console.log(`--- Bot Logic ---`)
console.log(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
console.log(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`--- End Bot Logic Check ---`)

import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update, BotCommand } from 'telegraf/types'
import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'
import { session } from 'telegraf'
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
    console.error(`❌ Ошибка валидации токена: ${(error as Error).message}`)
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
    console.error(`❌ Ошибка проверки порта ${port}:`, error)
    return true
  }
}

// Добавляю логи перед инициализацией ботов
async function initializeBots() {
  // Запускаем Hello World сервер в самом начале
  console.log('🔧 Режим работы:', isDev ? 'development' : 'production')
  console.log('📝 Загружен файл окружения:', process.env.NODE_ENV)

  console.log('🔄 [SCENE_DEBUG] Проверка импорта stage из registerCommands...')
  const { stage } = await import('./registerCommands')
  console.log('✅ [SCENE_DEBUG] Stage импортирован успешно')
  // Проверим сцены другим способом
  try {
    const stageInfo = (stage as any)._handlers || []
    console.log(
      '📊 [SCENE_DEBUG] Количество обработчиков сцен:',
      stageInfo.length
    )
  } catch (error) {
    console.log(
      '⚠️ [SCENE_DEBUG] Не удалось получить информацию о количестве сцен:',
      (error as Error).message
    )
  }

  // 🔧 FIX: ВСЕГДА используем polling во всех режимах
  // Для production правильно использовать polling (webhook требует домен)
  const mode = 'polling'

  console.log(`🎯 [MODE] Выбран режим: ${mode} (isDev: ${isDev})`)

  if (mode === 'polling') {
    // 🔧 POLLING MODE: Запускаем ВСЕ боты в polling режиме (как в webhook, но без портов)
    console.log(`🔄 [POLLING] Запуск всех доступных ботов в polling режиме`)

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

    // 🔧 Запускаем ВСЕХ ботов параллельно (НЕ блокируя цикл!)
    const botPromises: Promise<void>[] = []

    for (const token of botTokens) {
      if (await validateBotToken(token)) {
        const bot = new Telegraf<MyContext>(token, {
          handlerTimeout: Infinity,
        })
        bot.use(Telegraf.log(console.log)) // Log all Telegraf updates and middleware flow

        // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
        bot.use(session()) // 1. Сессия (из bot.ts)
        bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
        setupErrorHandler(bot)

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
        setupNotificationProcessor(bot)

        registerCommands({ bot }) // 3. Сцены и команды (включая stage.middleware() и hears обработчики)
        // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
        setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
        // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
        bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
        bot.on('successful_payment', handleSuccessfulPayment as any)
        // Обработчик текстовых сообщений по умолчанию - должен быть последним
        // ВРЕМЕННО ОТКЛЮЧЕН: handleTextMessage - он мешает работе wizard сцен
        // bot.on(message('text'), handleTextMessage)
        // <<<---------------------------------------------------->>>

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        // Используем импортированную функцию setBotCommands
        await setBotCommands(bot)

        // 🔧 FIX: Очистка webhook перед polling
        try {
          const webhookInfo = await bot.telegram.getWebhookInfo()
          if (webhookInfo.url) {
            console.log(
              `🔌 [WEBHOOK] Обнаружен активный вебхук для ${botInfo.username}: ${webhookInfo.url}. Удаляю...`
            )
            await bot.telegram.deleteWebhook({ drop_pending_updates: true })
            console.log('✅ [WEBHOOK] Вебхук удалён, переходим к polling')
          } else {
            console.log('🟢 [WEBHOOK] Активного вебхука нет, можно запускать polling')
          }
        } catch (error) {
          console.warn('⚠️ [WEBHOOK] Не удалось получить/удалить вебхук:', String(error))
        }

        // 🔧 ЗАПУСКАЕМ БОТ БЕЗ await, чтобы не блокировать цикл!
        const botPromise = bot.launch({
          allowedUpdates: [
            'message',
            'callback_query',
            'pre_checkout_query' as any,
            'successful_payment' as any,
          ],
        })
          .then(() => {
            console.log(`🚀 Бот ${botInfo.username} запущен в polling режиме`)
          })
          .catch((error) => {
            console.error(`❌ Ошибка запуска бота ${botInfo.username}:`, error)
          })

        botPromises.push(botPromise)
      }
    }

    // Ждём завершения инициализации всех ботов
    await Promise.all(botPromises)
    console.log(`✅ Все боты успешно запущены в polling режиме`)
  } else if (mode === 'webhook') {
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
        bot.use(Telegraf.log(console.log)) // Log all Telegraf updates and middleware flow

        // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
        bot.use(session()) // 1. Сессия (из bot.ts)
        bot.use(languageMiddleware) // 2. ✅ LANGUAGE MIDDLEWARE - получает язык из БД ОДИН РАЗ!

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК ОШИБОК
        setupErrorHandler(bot)

        // ✅ ДОБАВЛЯЕМ ОБРАБОТЧИК УВЕДОМЛЕНИЙ
        setupNotificationProcessor(bot)

        registerCommands({ bot }) // 3. Сцены и команды (включая stage.middleware() и hears обработчики)
        // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
        setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
        // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
        bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
        bot.on('successful_payment', handleSuccessfulPayment as any)
        // Обработчик текстовых сообщений по умолчанию - должен быть последним
        // ВРЕМЕННО ОТКЛЮЧЕН: handleTextMessage - он мешает работе wizard сцен
        // bot.on(message('text'), handleTextMessage)
        // <<<---------------------------------------------------->>>

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        // Используем импортированную функцию setBotCommands
        await setBotCommands(bot)

        // Запускаем webhook для каждого бота
        // Старый блок установки команд ниже должен быть полностью удален

        // webhook settings
        // ... existing code ...

        while (await isPortInUse(currentPort)) {
          console.log(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        console.log(
          `🔌 Используем порт ${currentPort} для бота ${botInfo.username}`
        )

        const webhookDomain = process.env.WEBHOOK_DOMAIN
        const usePolling = process.env.USE_POLLING === 'true'

        if (usePolling || !webhookDomain) {
          // Используем polling режим
          console.log(`🔄 Запуск бота ${botInfo.username} в polling режиме`)
          await bot.telegram.deleteWebhook() // Удаляем webhook перед polling
          bot.launch({
            allowedUpdates: [
              'message',
              'callback_query',
              'pre_checkout_query' as any,
              'successful_payment' as any,
            ],
          })
          console.log(`🚀 Бот ${botInfo.username} запущен в polling режиме`)
        } else {
          // Используем webhook режим
          console.log(`🔗 Запуск бота ${botInfo.username} в webhook режиме`)

          // Формируем правильный путь для вебхука, используя имя бота
          const webhookPath = `/${botInfo.username}` // Используем имя бота как путь

          bot.launch({
            webhook: {
              domain: webhookDomain,
              port: currentPort,
              hookPath: webhookPath, // Используем hookPath, как было раньше
            },
            allowedUpdates: [
              'message',
              'callback_query',
              'pre_checkout_query' as any,
              'successful_payment' as any,
            ],
          })
          console.log(
            `🚀 Бот ${botInfo.username} запущен в webhook режиме на порту ${currentPort}`
          )

          await new Promise(resolve => setTimeout(resolve, 2000))
          currentPort++
        }
      }
    }
  } else {
    throw new Error(
      `❌ Неизвестный режим MODE="${mode}". Допустимые значения: "polling" или "webhook"`
    )
  }

  console.log('🔍 Инициализация сцен...')
  // Перед регистрацией каждой сцены добавляю лог
  console.log('📋 Регистрация сцены: payment_scene')
  // ... существующий код регистрации сцен ...

  // После регистрации всех сцен добавляю итоговый лог:
  console.log('✅ Все сцены успешно зарегистрированы')
}

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  console.log(`🚨 Получен сигнал ${signal}. Завершение работы...`)
  for (const bot of botInstances) {
    console.log(`🚫 Остановка бота ${bot.botInfo?.username}...`)
    await bot.stop()
  }
  process.exit(0)
}

// Ловим сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

console.log('🏁 Запуск приложения')

// Запускаем API сервер
// Это будет выполнено при старте src/bot.ts
startApiServer()

// Возвращаем корректный запуск инициализации ботов
initializeBots()
  .then(() => {
    console.log('✅ Боты и API сервер успешно запущены') // Обновим сообщение
  })
  .catch(error => {
    console.error(
      '❌ Ошибка при инициализации приложения (боты или API сервер):',
      error
    )
    process.exit(1)
  })
