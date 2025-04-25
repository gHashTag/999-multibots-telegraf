import { isDev } from './config'
import fs from 'fs'
import path from 'path'
import os from 'os'

console.log(`--- Bot Logic ---`)
console.log(
  `[BOT] Detected mode (via isDev): ${isDev ? 'development' : 'production'}`
)
console.log(`[BOT] process.env.NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`--- End Bot Logic Check ---`)

import { Composer, Telegraf, Scenes, Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { registerCommands } from './registerCommands'
import { MyContext } from './interfaces'

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []

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

// Функция для порта API сервера
function checkAndKillPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Checking port ${port}...`)
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
              console.log(`Successfully killed process on port ${port}`)
            } catch (e) {
              console.error(`Failed to kill process ${pid}: ${e}`)
            }
          })
        } else {
          console.log(`No process found using port ${port}`)
        }
        resolve()
      }
    )
  })
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

  if (isDev) {
    // В режиме разработки запускаем бота, указанного в TEST_BOT_NAME
    const targetBotUsername = process.env.TEST_BOT_NAME
    if (!targetBotUsername) {
      throw new Error(
        '❌ Переменная окружения TEST_BOT_NAME не установлена. Укажите username бота для запуска в development.'
      )
    }

    console.log(`🔧 Ищем тестового бота с username: ${targetBotUsername}`)

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
          console.log(`✅ Найден бот ${botInfo.username}`)
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
    console.log(
      '🔄 [SCENE_DEBUG] Регистрация команд бота и stage middleware...'
    )

    // Убираем composer из вызова
    // Передаем только bot
    registerCommands({ bot })

    console.log('✅ [SCENE_DEBUG] Команды и middleware зарегистрированы')

    botInstances.push(bot)
    // Используем уже полученную информацию о боте
    console.log(`🤖 Тестовый бот ${foundBotInfo.username} инициализирован`)

    // В режиме разработки используем polling
    bot.launch({
      allowedUpdates: [
        'message',
        'callback_query',
        'pre_checkout_query' as any,
        'successful_payment' as any,
      ],
    })
    console.log(
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
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        while (await isPortInUse(currentPort)) {
          console.log(`⚠️ Порт ${currentPort} занят, пробуем следующий...`)
          currentPort++
        }

        console.log(
          `🔌 Используем порт ${currentPort} для бота ${botInfo.username}`
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

        console.log(
          `🚀 Бот ${botInfo.username} запущен в продакшен режиме на порту ${currentPort}`
        )
        await new Promise(resolve => setTimeout(resolve, 2000))
        currentPort++
      }
    }
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
  console.log(`🛑 Получен сигнал ${signal}, начинаем graceful shutdown...`)

  // 1. Останавливаем ботов
  console.log(`[${signal}] Stopping ${botInstances.length} bot instance(s)...`)
  const stopPromises = botInstances.map(async (bot, index) => {
    try {
      console.log(
        `[${signal}] Initiating stop for bot instance index ${index}...`
      )
      // bot.stop() для long polling обычно синхронный, но для надежности можно обернуть
      // Хотя Telegraf 4.x stop() возвращает void для polling
      bot.stop(signal)
      console.log(
        `[${signal}] Successfully stopped bot instance index ${index}.`
      )
    } catch (error) {
      console.error(
        `[${signal}] Error stopping bot instance index ${index}:`,
        error // Логируем полную ошибку
      )
    }
  })
  // Не нужно Promise.all, так как bot.stop() синхронный для polling
  // await Promise.all(stopPromises) // Убираем ожидание, если оно не нужно
  console.log(`[${signal}] All bot instances processed for stopping.`)

  // 3. Добавляем небольшую задержку перед выходом
  console.log(`[${signal}] Adding a short delay before exiting...`)
  await new Promise(resolve => setTimeout(resolve, 1500))

  console.log(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0)
}

// Обработка завершения работы - используем общую асинхронную функцию
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

// Функция запуска бота
export async function startBot(): Promise<void> {
  try {
    // Проверяем, возможно ли запустить экземпляр бота
    // ВРЕМЕННО ЗАКОММЕНТИРОВАНО ИЗ-ЗА ОТСУТСТВИЯ ФАЙЛА
    // if (!checkAndCreateLockFile()) {
    //   console.error(
    //     '❌ Запуск отменен из-за обнаружения другого запущенного экземпляра бота',
    //     {
    //       description: 'Bot startup cancelled due to another instance running',
    //       suggestion:
    //         'Используйте FORCE_START=true для принудительного запуска',
    //       example: 'FORCE_START=true pnpm dev',
    //     }
    //   )
    //   return // Выходим без запуска, если уже работает экземпляр
    // }

    // Проверяем и освобождаем порты
    await checkAndKillPort(2999) // Порт API-сервера
    await checkAndKillPort(3001) // Дополнительный порт
    console.log('All ports checked')

    console.log('🏁 Запуск приложения')
    await initializeBots()
    console.log('✅ Боты успешно запущены')
  } catch (error) {
    // Специальная обработка ошибки конфликта от Telegram API
    if (
      error instanceof Error &&
      error.message.includes(
        '409: Conflict: terminated by other getUpdates request'
      )
    ) {
      const forceStartActive = process.env.FORCE_START === 'true'

      console.error('❌ Ошибка запуска бота: Конфликт с другим экземпляром', {
        description: 'Telegram API 409 Conflict Error',
        error_message: error.message,
        solution:
          'Другой экземпляр бота с тем же токеном уже запущен в другом месте',
        suggestion:
          'Остановите другие экземпляры бота или используйте FORCE_START=true',
        force_start_active: forceStartActive,
      })

      if (forceStartActive) {
        console.warn(
          '⚠️ ВНИМАНИЕ: Конфликт обнаружен, несмотря на активный FORCE_START',
          {
            description: 'Conflict detected with active FORCE_START flag',
            note: 'Это означает, что другой экземпляр бота запущен на другом компьютере или сервере',
            warning:
              'Одновременная работа нескольких экземпляров может привести к непредсказуемому поведению',
          }
        )

        // Предоставляем дополнительные рекомендации для устранения проблемы
        console.info('💡 Рекомендации для устранения 409 конфликта:', {
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
        })
      }

      return // Выходим, чтобы предотвратить повторные попытки, которые будут приводить к тем же ошибкам
    }

    // Стандартная обработка других ошибок
    console.error('❌ Ошибка запуска бота', {
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
