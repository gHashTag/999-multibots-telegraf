import { isDev } from './config'

console.log(`--- Bot Logic ---`)
console.log(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
console.log(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`--- End Bot Logic Check ---`)

import { Composer, Telegraf } from 'telegraf'

import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'
import { setupWebhookHandlers } from './webhookHandler'
// Импортируем Express для Robokassa вебхуков
import express from 'express'
import fileUpload from 'express-fileupload'
import { handleRobokassaResult } from './webhooks/robokassa/robokassa.handler'
import * as http from 'http'

// Инициализация ботов
const botInstances: Telegraf[] = []
let robokassaServer: http.Server | null = null

// Создаем и экспортируем Composer глобально
export const composer = new Composer<MyContext>()

// Функция для проверки валидности токена
async function validateBotToken(token: string): Promise<boolean> {
  try {
    const bot = new Telegraf(token)
    await bot.telegram.getMe()
    return true
  } catch (error) {
    console.error(`❌ Ошибка валидации токена: ${error.message}`)
    return false
  }
}

// Функция для проверки занятости порта
async function isPortInUse(port: number): Promise<boolean> {
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

// Функция запуска сервера для обработки Robokassa вебхуков
async function startRobokassaWebhookServer(): Promise<http.Server | null> {
  // Порт для Robokassa webhook
  const robokassaPort = process.env.ROBOKASSA_WEBHOOK_PORT || 2999

  // Создаем экземпляр express
  const app = express()

  // Middleware для разбора URL-encoded формы
  app.use(express.urlencoded({ extended: true }))

  // Middleware для разбора JSON данных
  app.use(express.json())

  // Middleware для обработки multipart/form-data
  app.use(fileUpload())

  // POST маршрут для обработки успешных платежей от Robokassa
  app.post('/payment-success', handleRobokassaResult)

  // POST маршрут для обработки результатов от Robokassa
  app.post('/robokassa-result', handleRobokassaResult)

  // Проверка работоспособности сервера
  app.get('/health', (req, res) => {
    res.status(200).send('OK')
  })

  // Запуск сервера и сохранение экземпляра
  // Добавляем небольшую задержку перед запуском, чтобы порт успел освободиться при перезапуске ts-node-dev
  const server = await new Promise<http.Server | null>(resolve => {
    setTimeout(() => {
      const expressServer = app
        .listen(robokassaPort, () => {
          console.log(
            `[Robokassa] Webhook server running on port ${robokassaPort}`
          )
          resolve(expressServer) // Резолвим промис с экземпляром сервера
        })
        .on('error', err => {
          console.error(
            `[Robokassa] Failed to start webhook server: ${err.message}`
          )
          if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
            console.error(
              `[Robokassa] Port ${robokassaPort} is already in use. Maybe another instance is running?`
            )
          }
          // В случае ошибки при запуске, сервер не будет создан, нужно обработать
          // Возможно, стоит выбросить ошибку или вернуть null/undefined,
          // но для простоты пока оставляем так, обработка ошибок выше.
          // resolve(null); // Или reject(err)
        })
    }, 100) // Задержка 100 мс
  })

  return server
}

// Инициализация ботов в зависимости от окружения
async function initializeBots() {
  console.log('🔧 Режим работы:', isDev ? 'development' : 'production')
  console.log('📝 Загружен файл окружения:', process.env.NODE_ENV)

  if (isDev) {
    // В режиме разработки используем только тестового бота
    const testBotToken = process.env.BOT_TOKEN_TEST_1
    if (!testBotToken) {
      throw new Error('❌ BOT_TOKEN_TEST_1 не найден в .env.development')
    }

    const bot = new Telegraf<MyContext>(testBotToken)
    bot.use(Composer.log())

    // Регистрируем команды, используя глобальный composer
    registerCommands({ bot, composer })

    botInstances.push(bot)
    const botInfo = await bot.telegram.getMe()
    console.log(`🤖 Тестовый бот ${botInfo.username} инициализирован`)

    // В режиме разработки используем polling
    bot.launch({
      allowedUpdates: ['message', 'callback_query'],
    })
    console.log(
      `🚀 Тестовый бот ${botInfo.username} запущен в режиме разработки`
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
    ].filter(Boolean)

    // Начинаем с порта 3001 для первого бота
    let currentPort = 3001

    for (const token of botTokens) {
      if (await validateBotToken(token)) {
        const bot = new Telegraf<MyContext>(token)
        bot.use(Composer.log())

        // Регистрируем команды, используя глобальный composer
        registerCommands({ bot, composer })

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        // Проверяем, свободен ли порт
        while (await isPortInUse(currentPort)) {
          console.log(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        console.log(
          `🔌 Используем порт ${currentPort} для бота ${botInfo.username}`
        )

        // В продакшене используем вебхуки
        try {
          bot.launch({
            webhook: {
              domain: process.env.WEBHOOK_DOMAIN,
              port: currentPort,
              path: `/telegraf/${bot.secretPathComponent()}`,
            },
            allowedUpdates: ['message', 'callback_query'],
          })
          console.log(
            `🚀 Бот ${botInfo.username} запущен в продакшен режиме на порту ${currentPort}`
          )
        } catch (error) {
          console.error(`❌ Ошибка запуска бота ${botInfo.username}:`, error)
        }

        // Увеличиваем порт для следующего бота
        currentPort++
      }
    }

    // Запускаем обработчик вебхуков на основном порту приложения
    setupWebhookHandlers(botInstances as Telegraf<MyContext>[])
  }

  // Запускаем сервер для обработки Robokassa вебхуков
  robokassaServer = await startRobokassaWebhookServer()
}

// Обработка завершения работы
process.once('SIGINT', () => {
  console.log('🛑 Получен сигнал SIGINT, завершаем работу...')
  console.log(`[SIGINT] Stopping ${botInstances.length} bot instance(s)...`)
  botInstances.forEach((bot, index) => {
    try {
      bot.stop('SIGINT')
      // Пытаемся получить username, если возможно (может не работать, если botInfo недоступен)
      // const botInfo = bot.telegram ? await bot.telegram.getMe() : null; // Нельзя использовать await в синхронном обработчике
      console.log(`[SIGINT] Called stop() for bot instance index ${index}.`)
    } catch (error) {
      console.error(
        `[SIGINT] Error stopping bot instance index ${index}:`,
        error
      )
    }
  })

  if (robokassaServer) {
    console.log('[Robokassa] Stopping webhook server...')
    const server = robokassaServer // Capture server instance
    robokassaServer = null // Prevent multiple close attempts

    const closeTimeout = setTimeout(() => {
      console.warn(
        '[Robokassa] Server close timed out after 2 seconds. Forcing exit.'
      )
      process.exit(1) // Force exit if close hangs
    }, 2000)

    server.close(err => {
      clearTimeout(closeTimeout)
      if (err) {
        console.error('[Robokassa] Error closing webhook server:', err)
        process.exit(1) // Exit with error if close fails
      } else {
        console.log('[Robokassa] Webhook server stopped successfully.')
        // Consider exiting only after all cleanup is done,
        // but for now, let's rely on the fact that bot stop might also exit.
        // process.exit(0); // Might be too early if bot.stop is async internally
      }
    })
  }
  // else {
  // If no server, maybe exit here? Let's rely on bot termination for now.
  // process.exit(0); // Might be too early if bot.stop is async internally
  // }
  // Allow some time for stops to propagate before potentially exiting forcefully elsewhere if needed.
})

process.once('SIGTERM', () => {
  console.log('🛑 Получен сигнал SIGTERM, завершаем работу...')
  console.log(`[SIGTERM] Stopping ${botInstances.length} bot instance(s)...`)
  botInstances.forEach((bot, index) => {
    try {
      bot.stop('SIGTERM')
      console.log(`[SIGTERM] Called stop() for bot instance index ${index}.`)
    } catch (error) {
      console.error(
        `[SIGTERM] Error stopping bot instance index ${index}:`,
        error
      )
    }
  })

  if (robokassaServer) {
    console.log('[Robokassa] Stopping webhook server...')
    const server = robokassaServer // Capture server instance
    robokassaServer = null // Prevent multiple close attempts

    const closeTimeout = setTimeout(() => {
      console.warn(
        '[Robokassa] Server close timed out after 2 seconds. Forcing exit.'
      )
      process.exit(1) // Force exit if close hangs
    }, 2000)

    server.close(err => {
      clearTimeout(closeTimeout)
      if (err) {
        console.error('[Robokassa] Error closing webhook server:', err)
        process.exit(1) // Exit with error if close fails
      } else {
        console.log('[Robokassa] Webhook server stopped successfully.')
        // process.exit(0); // See SIGINT comments
      }
    })
  }
  // else {
  // process.exit(0); // See SIGINT comments
  // }
})

console.log('🏁 Запуск приложения')
initializeBots()
  .then(() => console.log('✅ Боты успешно запущены'))
  .catch(error => console.error('❌ Ошибка при запуске ботов:', error))
