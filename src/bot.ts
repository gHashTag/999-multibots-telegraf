import { isDev } from './config'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { checkAndCreateLockFile } from './utils/checkAndCreateLockFile'
import { logger } from './utils/logger'

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

import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { registerCommands } from './registerCommands'
import type { MyContext } from './interfaces'

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []

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

    botInstances.push(bot)
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
    ].filter((token): token is string => Boolean(token))

    let currentPort = 3001

    for (const token of botTokens) {
      if (await validateBotToken(token)) {
        const bot = new Telegraf<MyContext>(token)
        bot.use(Composer.log())

        registerCommands({ bot })

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        logger.info(`🤖 Бот ${botInfo.username} инициализирован`)

        while (await isPortInUse(currentPort)) {
          logger.warn(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        logger.info(
          `🚀 Используем порт ${currentPort} для бота ${botInfo.username}`
        )

        const webhookDomain = process.env.WEBHOOK_DOMAIN
        if (!webhookDomain) {
          throw new Error('WEBHOOK_DOMAIN не установлен в переменных окружения')
        }

        // Формируем правильный путь для вебхука, используя имя бота
        const webhookPath = `/${botInfo.username}` // Используем имя бота как путь

        bot.launch({
          webhook: {
            domain: webhookDomain,
            port: currentPort,
            hookPath: webhookPath, // Новый путь с именем бота
          },
          allowedUpdates: [
            'message',
            'callback_query',
            'pre_checkout_query' as any,
            'successful_payment' as any,
          ],
        })

        logger.info(
          `🚀 Бот ${botInfo.username} запущен в продакшен режиме на порту ${currentPort}`
        )
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentPort++
      }
    }
  }

  logger.info('🔍 Инициализация сцен...')
  // Перед регистрацией каждой сцены добавляю лог
  logger.info('📋 Регистрация сцены: payment_scene')
  // ... существующий код регистрации сцен ...

  // После регистрации всех сцен добавляю итоговый лог:
  logger.info('✅ Все сцены успешно зарегистрированы')
}

// Асинхронная функция для остановки
async function gracefulShutdown(signal: string) {
  logger.info(`🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`)

  // 1. Останавливаем ботов
  logger.info(`[${signal}] Stopping ${botInstances.length} bot instance(s)...`)
  const stopPromises = botInstances.map(async (bot, index) => {
    try {
      logger.info(
        `[${signal}] Initiating stop for bot instance index ${index}...`
      )
      // bot.stop() для long polling обычно синхронный, но для надежности можно обернуть
      // Хотя Telegraf 4.x stop() возвращает void для polling
      bot.stop(signal)
      logger.info(
        `[${signal}] Successfully stopped bot instance index ${index}.`
      )
    } catch (error) {
      logger.error(
        `[${signal}] Error stopping bot instance index ${index}:`,
        error // Логируем полную ошибку
      )
    }
  })
  // Не нужно Promise.all, так как bot.stop() синхронный для polling
  // await Promise.all(stopPromises) // Убираем ожидание, если оно не нужно
  logger.info(`[${signal}] All bot instances processed for stopping.`)

  // 3. Добавляем небольшую задержку перед выходом
  logger.info(`[${signal}] Adding a short delay before exiting...`)
  await new Promise(resolve => setTimeout(resolve, 1500))

  logger.info(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0)
}

// Обработка завершения работы - используем общую асинхронную функцию
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Функция запуска бота
export async function startBot(): Promise<void> {
  try {
    // Проверяем, возможно ли запустить экземпляр бота
    if (!checkAndCreateLockFile()) {
      logger.error(
        '❌ Запуск отменен из-за обнаружения другого запущенного экземпляра бота',
        {
          description: 'Bot startup cancelled due to another instance running',
          suggestion:
            'Используйте FORCE_START=true для принудительного запуска',
          example: 'FORCE_START=true pnpm dev',
        }
      )
      return // Выходим без запуска, если уже работает экземпляр
    }

    // Проверяем и освобождаем порты
    await checkAndKillPort(2999) // Порт API-сервера
    await checkAndKillPort(3001) // Дополнительный порт
    logger.info('✅ All ports checked')

    logger.info('🏁 Запуск приложения')
    await initializeBots()
    logger.info('✅ Боты успешно запущены')
  } catch (error) {
    // Специальная обработка ошибки конфликта от Telegram API
    if (
      error instanceof Error &&
      error.message.includes(
        '409: Conflict: terminated by other getUpdates request'
      )
    ) {
      const forceStartActive = process.env.FORCE_START === 'true'
      const lockFileExists = fs.existsSync(
        path.join(process.cwd(), '.bot.lock')
      )

      // Записываем информацию о конфликте для дальнейшего анализа
      recordTelegramConflict(error.message, forceStartActive, {
        lock_file_exists: lockFileExists,
        time_of_day: new Date().toLocaleTimeString(),
        env_variables: {
          isDev,
          test_bot_name: process.env.TEST_BOT_NAME,
          webhook_domain: process.env.WEBHOOK_DOMAIN,
          // Не логируем токены и другие чувствительные данные!
        },
      })

      // Улучшаем сообщение об ошибке
      logger.error('❌ Ошибка запуска бота: Конфликт с другим экземпляром', {
        description: 'Telegram API 409 Conflict Error',
        error_message: error.message,
        solution: lockFileExists
          ? 'Обнаружен файл блокировки (.bot.lock). Другой экземпляр бота активен.'
          : 'Другой экземпляр бота с тем же токеном уже запущен в другом месте',
        suggestion: lockFileExists
          ? 'Проверьте запущенные процессы или удалите файл .bot.lock вручную'
          : 'Остановите другие экземпляры бота или используйте FORCE_START=true',
        force_start_active: forceStartActive,
        lock_file_exists: lockFileExists,
        conflict_logs_path: CONFLICT_LOG_PATH,
      })

      if (forceStartActive) {
        logger.warn(
          '⚠️ ВНИМАНИЕ: Конфликт обнаружен, несмотря на активный FORCE_START',
          {
            description: 'Conflict detected with active FORCE_START flag',
            note: 'Это означает, что другой экземпляр бота запущен на другом компьютере или сервере',
            warning:
              'Одновременная работа нескольких экземпляров может привести к непредсказуемому поведению',
          }
        )

        // Предоставляем дополнительные рекомендации для устранения проблемы
        logger.info('💡 Рекомендации для устранения 409 конфликта:', {
          description: 'Tips for resolving 409 conflict',
          steps: [
            'Проверьте другие компьютеры или серверы, где может быть запущен бот',
            'Убедитесь, что на сервере нет запущенных процессов бота (используйте `ps aux | grep node`)',
            'Если бот запущен в webhook режиме на сервере, вы не сможете запустить его в polling режиме локально',
            'Подождите 1-2 минуты, Telegram может очистить сессию самостоятельно',
            'В крайнем случае, используйте другой токен бота для разработки',
          ],
          webhook_note:
            'Если бот настроен на работу через webhook, он не может одновременно работать в режиме polling',
          additional_tip:
            'Добавьте ?new_session=true к URL вашего бота в BotFather для сброса сессии',
        })
      }

      return // Выходим, чтобы предотвратить повторные попытки, которые будут приводить к тем же ошибкам
    }

    // Стандартная обработка других ошибок
    logger.error('❌ Ошибка запуска бота', {
      description: 'Error starting bot',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

// Начинаем выполнение, если файл запущен напрямую
if (require.main === module) {
  startBot()
}
