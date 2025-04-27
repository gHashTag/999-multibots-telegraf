import { isDev } from './config'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { checkAndCreateLockFile } from './utils/checkAndCreateLockFile'
import { logger } from './utils/logger'
import startApiServer from './api-server'
import initializeApiServer from './api-server'
import type { FastifyInstance } from 'fastify'
import type { MyContext } from '@/interfaces'
import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import type { Message, Update } from 'telegraf/types'
import { registerCommands } from './registerCommands'

// Возвращаем массив для хранения инстансов ботов
export const botInstances: Telegraf<MyContext>[] = []

// Путь к файлу конфликта
const CONFLICT_LOG_PATH = path.join(process.cwd(), 'logs', 'telegram_conflicts')

// Создаем директорию для логов конфликтов, если её нет
if (!fs.existsSync(CONFLICT_LOG_PATH)) {
  fs.mkdirSync(CONFLICT_LOG_PATH, { recursive: true })
}

/**
 * Сохраняет информацию о конфликте 409 в отдельный файл для последующего анализа
 * @param errorMessage Сообщение об ошибке
 * @param forceStartActive Был ли активирован режим принудительного запуска
 * @param additionalInfo Дополнительная информация о конфликте
 */
function recordTelegramConflict(
  errorMessage: string,
  forceStartActive: boolean,
  additionalInfo: Record<string, any> = {}
): void {
  try {
    const timestamp = new Date().toISOString()
    const fileName = path.join(
      CONFLICT_LOG_PATH,
      `conflict_${timestamp.replace(/[:.]/g, '_')}.json`
    )

    const conflictData = {
      timestamp,
      error_message: errorMessage,
      force_start_active: forceStartActive,
      computer_name: os.hostname(),
      username: os.userInfo().username,
      platform: process.platform,
      node_version: process.version,
      environment: process.env.NODE_ENV,
      pid: process.pid,
      ...additionalInfo,
    }

    fs.writeFileSync(fileName, JSON.stringify(conflictData, null, 2))
    logger.info(`✅ Информация о конфликте 409 сохранена в файл: ${fileName}`, {
      description: 'Telegram 409 conflict recorded to file',
      file_path: fileName,
    })
  } catch (error) {
    logger.error('❌ Ошибка при сохранении информации о конфликте', {
      description: 'Failed to save conflict information',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(`--- Bot Logic ---`)
console.log(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
console.log(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`--- End Bot Logic Check ---`)

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

// Функция для порта API сервера
function checkAndKillPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info(`Checking port ${port}...`)
    // Находим процессы, использующие порт
    const exec = require('child_process').exec
    exec(
      `lsof -i :${port} -t`,
      (error: any, stdout: string, stderr: string) => {
        if (stdout) {
          const pids = stdout.trim().split('\n')
          pids.forEach(pid => {
            try {
              // Завершаем процесс
              process.kill(parseInt(pid), 'SIGKILL')
              logger.info(`Successfully killed process on port ${port}`)
            } catch (e) {
              logger.error(`Failed to kill process ${pid}: ${e}`)
            }
          })
        } else {
          logger.info(`No process found using port ${port}`)
        }
        resolve()
      }
    )
  })
}

// Добавляю логи перед инициализацией ботов
async function initializeBots() {
  // Запускаем Hello World сервер в самом начале
  logger.info('🔧 Режим работы:', isDev ? 'development' : 'production')
  logger.info('📝 Загружен файл окружения:', process.env.NODE_ENV)

  logger.info('🔄 [SCENE_DEBUG] Проверка импорта stage из registerCommands...')
  const { stage } = await import('./registerCommands')
  logger.info('✅ [SCENE_DEBUG] Stage импортирован успешно')
  // Проверим сцены другим способом
  try {
    const stageInfo = (stage as any)._handlers || []
    logger.info(
      '📊 [SCENE_DEBUG] Количество обработчиков сцен:',
      stageInfo.length
    )
  } catch (error) {
    logger.info(
      '⚠️ [SCENE_DEBUG] Не удалось получить информацию о количестве сцен:',
      (error as Error).message
    )
  }

  if (isDev) {
    // В режиме разработки запускаем бота, указанного в TEST_BOT_NAME
    const targetBotUsername = process.env.TEST_BOT_NAME
    if (!targetBotUsername) {
      throw new Error(
        '❌ Переменная окружения TEST_BOT_NAME не установлена. Укажите username бота для запуска в development.'
      )
    }

    logger.info(`🔧 Ищем тестового бота с username: ${targetBotUsername}`)

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
        const tempBot = new Telegraf<MyContext>(token)
        const botInfo = await tempBot.telegram.getMe()
        if (botInfo.username === targetBotUsername) {
          logger.info(`✅ Найден бот ${botInfo.username}`)
          bot = tempBot // Используем этого бота
          foundBotInfo = botInfo
          break // Прерываем цикл, бот найден
        }
      } catch (error) {
        // Игнорируем ошибки валидации токенов, просто ищем дальше
        // console.warn(`⚠️ Ошибка проверки токена ${token.substring(0, 10)}...: ${error.message}`);
      }
    }

    if (!bot || !foundBotInfo) {
      throw new Error(
        `❌ Бот с username '${targetBotUsername}' не найден среди токенов в .env или токен невалиден.`
      )
    }

    // Добавляем логи перед регистрацией команд
    logger.info(
      '🔄 [SCENE_DEBUG] Регистрация команд бота и stage middleware...'
    )

    // Убираем composer из вызова
    // Передаем только bot
    registerCommands({ bot })

    logger.info('✅ [SCENE_DEBUG] Команды и middleware зарегистрированы')

    botInstances.push(bot) // Добавляем в массив
    // Используем уже полученную информацию о боте
    logger.info(`🤖 Тестовый бот ${foundBotInfo.username} инициализирован`)

    // В режиме разработки используем polling
    bot.launch({
      allowedUpdates: [
        'message',
        'callback_query',
        'pre_checkout_query' as any,
        'successful_payment' as any,
      ],
    })
    logger.info(
      `🚀 Тестовый бот ${foundBotInfo.username} запущен в режиме разработки (polling)`
    )
  } else {
    // В продакшене используем все активные боты
    logger.info(
      '[Production Mode] Инициализация ботов на основе ACTIVE_BOTS...'
    )

    const activeBotVarNames = (process.env.ACTIVE_BOTS || '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)

    if (activeBotVarNames.length === 0) {
      logger.warn(
        '[Production Mode] Переменная ACTIVE_BOTS не установлена или пуста. Боты не будут запущены.'
      )
      // В режиме Vercel нам все равно нужно инициализировать Fastify, даже если ботов нет
      // Поэтому не выходим здесь
    } else {
      logger.info(
        `[Production Mode] Активные переменные ботов: ${activeBotVarNames.join(', ')}`
      )
    }

    // Инициализируем Fastify сервер ЗДЕСЬ, но не запускаем listen
    // Используем импортированный инстанс fastify из fastify-server
    const fastifyInstance = (await import('./fastify-server')).default
    // Вызовем setupServer для применения настроек, если это еще не сделано
    // Возможно, setupServer нужно вызывать только один раз при инициализации
    // Убедимся, что setupServer идемпотентен или вызывается правильно.
    // В fastify-server.ts setupServer вызывается внутри startFastifyServer,
    // который мы больше не вызываем напрямую для запуска listen.
    // Нужно вызывать setupServer() где-то при инициализации приложения.
    // Пока предполагаем, что fastifyInstance уже настроен при импорте.

    for (const varName of activeBotVarNames) {
      const token = process.env[varName]
      if (!token) {
        logger.warn(`[Production Mode] Токен для ${varName} не найден в env.`)
        continue
      }
      // Проверка валидности токена перед созданием
      if (!(await validateBotToken(token))) {
        logger.error(
          `❌ [Production Mode] Невалидный токен для ${varName}. Пропуск бота.`
        )
        continue
      }

      try {
        const bot = new Telegraf<MyContext>(token)

        const botInfo = await bot.telegram.getMe()
        logger.info(
          `🤖 [Production Mode] Бот ${botInfo.username} инициализирован.`
        )

        // Регистрируем команды и сцены
        registerCommands({ bot })
        logger.info(
          `✅ [Production Mode] Команды и middleware для ${botInfo.username} зарегистрированы.`
        )

        botInstances.push(bot) // Добавляем в массив для дальнейшего использования

        // --- УДАЛЯЕМ УСТАНОВКУ ВЕБХУКА И ЗАПУСК ЗДЕСЬ ---
        // const webhookUrl = `${process.env.WEBHOOK_DOMAIN}/api/webhook/${botInfo.id}`
        // logger.info(`[Production Mode] Установка webhook для ${botInfo.username} на ${webhookUrl}`)
        // await bot.telegram.setWebhook(webhookUrl, {
        //   allowed_updates: [
        //     'message',
        //     'callback_query',
        //     'pre_checkout_query' as any,
        //     'successful_payment' as any,
        //   ],
        //   secret_token: process.env.SECRET_API_KEY, // Используем для безопасности
        // })
        // logger.info(`✅ [Production Mode] Webhook для ${botInfo.username} установлен.`)

        // --- УДАЛЯЕМ bot.launch() ---
        // Вместо bot.launch(), вебхуки будут обрабатываться через Fastify
      } catch (error) {
        logger.error(
          `❌ [Production Mode] Ошибка инициализации или установки webhook для бота с переменной ${varName}:`,
          error
        )
      }
    } // end for

    // --- УДАЛЯЕМ ЗАПУСК API СЕРВЕРА ЗДЕСЬ ---
    // await initializeApiServer() // Больше не нужно запускать listen()
  } // end else (production)

  // Логика для graceful shutdown остается
  process.once('SIGINT', () => gracefulShutdown('SIGINT'))
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

  logger.info('🏁 Инициализация ботов завершена.')

  // Возвращаем инстансы для возможного использования
  return botInstances
}

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  logger.info(`🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`)

  logger.info(`[${signal}] Stopping ${botInstances.length} bot instance(s)...`) // Используем botInstances
  const stopPromises = botInstances.map(async (bot, index) => {
    // Используем botInstances
    try {
      logger.info(
        `[${signal}] Initiating stop for bot instance index ${index}...`
      )
      bot.stop(signal)
      logger.info(
        `[${signal}] Successfully stopped bot instance index ${index}.`
      )
    } catch (error) {
      logger.error(
        `[${signal}] Error stopping bot instance index ${index}:`,
        error
      )
    }
  })
  logger.info(`[${signal}] All bot instances processed for stopping.`)

  logger.info(`[${signal}] Adding a short delay before exiting...`)
  await new Promise(resolve => setTimeout(resolve, 1500))

  logger.info(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0)
}

// --- ЭКСПОРТ ДЛЯ VERCEL ---
import server from './fastify-server' // Импортируем настроенный инстанс Fastify

// Флаг для отслеживания завершения инициализации
let isInitialized = false
let initPromise: Promise<any> | null = null

// Функция для инициализации всего приложения
async function ensureInitialized() {
  if (!isInitialized && !initPromise) {
    console.log('Starting initialization...')
    // Запускаем инициализацию ботов (которая больше не вызывает listen/launch)
    // и предполагаем, что Fastify уже настроен при импорте
    initPromise = initializeBots()
      .then(() => {
        console.log('Initialization complete.')
        isInitialized = true
        initPromise = null // Сбросить промис после завершения
        // Важно: Убедиться, что роут вебхука в Fastify настроен ПРАВИЛЬНО
        // для работы с botInstances
      })
      .catch(err => {
        console.error('Initialization failed:', err)
        initPromise = null // Сбросить промис при ошибке
        // Возможно, стоит выбросить ошибку, чтобы Vercel знал о проблеме
        throw err
      })
    await initPromise
  } else if (initPromise) {
    // Если инициализация уже идет, дожидаемся ее завершения
    await initPromise
  }
}

// Обработчик для Vercel
export default async (req: any, res: any) => {
  try {
    // Убеждаемся, что инициализация завершена перед обработкой запроса
    await ensureInitialized()

    // Передаем запрос на обработку в Fastify
    // Мы используем server.server.emit, так как Fastify под капотом использует http.Server
    server.server.emit('request', req, res)
  } catch (error) {
    // Обработка ошибок инициализации или других проблем
    console.error('Error handling request in Vercel function:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error:
          'Internal Server Error during initialization or request handling.',
      })
    )
  }
}

// --- Старый код запуска (если нужно для локального тестирования без Vercel) ---
// export async function startBot(): Promise<void> {
//   await initializeBots();
//   // Если нужно запустить локально НЕ через Vercel, можно добавить вызов listen здесь
//   // if (isDev || process.env.START_LOCAL === 'true') {
//   //   const localPort = parseInt(process.env.PORT || '3000', 10);
//   //   await server.listen({ port: localPort, host: '0.0.0.0' });
//   // }
// }
