import { isDev } from './config'

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

// Импорт новой команды
import { setupStatsCommand } from './commands/statsCommand'

import { handleTextMessage } from './handlers/handleTextMessage'
import { message } from 'telegraf/filters'

// Импортируем наш API сервер из новой директории
import { startApiServer } from './api_server'
import { setupHearsHandlers } from './hearsHandlers'

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
        const tempBot = new Telegraf<MyContext>(token, {
          handlerTimeout: Infinity,
        })
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
    //
    // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
    bot.use(session()) // 1. Сессия (из bot.ts)
    bot.use(Telegraf.log(console.log)) // Log all Telegraf updates and middleware flow
    registerCommands({ bot }) // 2. Сцены и команды (включая stage.middleware())
    // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
    setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
    // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
    bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
    bot.on('successful_payment', handleSuccessfulPayment as any)
    // Инициализация обработчиков hears из отдельного файла
    setupHearsHandlers(bot) // 4. Hears (Возвращаем)

    // Обработчик текстовых сообщений по умолчанию - должен быть последним
    bot.on(message('text'), handleTextMessage)
    // <<<---------------------------------------------------->>>

    // Используем импортированную функцию setBotCommands
    await setBotCommands(bot)

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
      process.env.BOT_TOKEN_8,
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
        registerCommands({ bot }) // 2. Сцены и команды (включая stage.middleware())
        // РЕГИСТРИРУЕМ НОВУЮ КОМАНДУ STATS
        setupStatsCommand(bot) // <--- НОВАЯ СТРОКА
        // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
        bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
        bot.on('successful_payment', handleSuccessfulPayment as any)
        // Инициализация обработчиков hears из отдельного файла
        setupHearsHandlers(bot) // 4. Hears (Возвращаем)

        // Обработчик текстовых сообщений по умолчанию - должен быть последним
        bot.on(message('text'), handleTextMessage)
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
        if (!webhookDomain) {
          throw new Error('WEBHOOK_DOMAIN не установлен в переменных окружения')
        }

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
