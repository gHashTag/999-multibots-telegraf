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
import util from 'util' // Добавляем util для promisify

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
  // Убираем setTimeout, полагаемся на корректное закрытие при SIGINT/SIGTERM
  const server = await new Promise<http.Server | null>(resolve => {
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
        resolve(null) // В случае ошибки вернем null
      })
  })
  // Убираем setTimeout

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

  // Запускаем сервер для обработки Robokassa вебхуков только в режиме разработки
  if (isDev) {
    robokassaServer = await startRobokassaWebhookServer()
  }
}

// Промисификация server.close
const closeServerAsync = robokassaServer
  ? util.promisify(robokassaServer.close.bind(robokassaServer))
  : async () => {
      /* No-op if server is null */
    } // Исправляем пустую функцию

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  console.log(`🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`)

  // 1. Останавливаем ботов
  console.log(`[${signal}] Stopping ${botInstances.length} bot instance(s)...`)
  const stopPromises = botInstances.map(async (bot, index) => {
    try {
      console.log(
        `[${signal}] Initiating stop for bot instance index ${index}...`
      )
      await bot.stop(signal) // Используем await для ожидания завершения
      console.log(
        `[${signal}] Successfully stopped bot instance index ${index}.`
      )
    } catch (error) {
      console.error(
        `[${signal}] Error stopping bot instance index ${index}:`,
        error.message || error // Логируем только сообщение об ошибке для краткости
      )
    }
  })
  await Promise.all(stopPromises) // Ждем завершения остановки всех ботов
  console.log(`[${signal}] All bot instances processed for stopping.`)

  // 2. Останавливаем сервер Robokassa, если он был запущен
  if (robokassaServer) {
    console.log(`[${signal}] [Robokassa] Stopping webhook server...`)
    try {
      await closeServerAsync() // Ожидаем закрытия сервера
      console.log(
        `[${signal}] [Robokassa] Webhook server stopped successfully.`
      )
      robokassaServer = null // Сбрасываем ссылку
    } catch (err) {
      console.error(
        `[${signal}] [Robokassa] Error closing webhook server:`,
        err
      )
      process.exit(1) // Выход с ошибкой, если сервер не закрылся
    }
  } else {
    console.log(
      `[${signal}] [Robokassa] Webhook server was not running or already stopped.`
    )
  }

  console.log(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0) // Успешный выход
}

// Обработка завершения работы - используем общую асинхронную функцию
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

console.log('🏁 Запуск приложения')
initializeBots()
  .then(() => console.log('✅ Боты успешно запущены'))
  .catch(error => console.error('❌ Ошибка при запуске ботов:', error))
