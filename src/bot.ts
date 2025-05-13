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
import { setupHearsHandlers } from './hearsHandlers'
import { session } from 'telegraf'
import {
  handleSuccessfulPayment,
  handlePreCheckoutQuery,
} from './handlers/paymentHandlers'

import { handleTextMessage } from './handlers/handleTextMessage'
import { message } from 'telegraf/filters'
import { logger } from './utils/logger'

// Импортируем наш API сервер из новой директории
// import { startApiServer } from './api_server'

// Импорт зависимостей для digitalAvatarBodyModule
import { initDigitalAvatarBodyModule } from '@/modules/digitalAvatarBody'
import {
  inngest,
  functions as inngestFunctions,
  helloWorld as helloWorldFunction,
} from '@/inngest_app/client' // Клиент Inngest
import { replicate } from '@/core/replicate' // Клиент Replicate
import {
  getUserBalance,
  updateUserBalance,
  supabase,
  getUserByTelegramId,
  updateUserLevelPlusOne,
  createModelTraining,
} from '@/core/supabase' // Функции Supabase
import { COSTS, UPLOAD_DIR, API_URL } from './config' // Импортируем COSTS, UPLOAD_DIR и API_URL
import {
  calculateCost as actualCalculateCost,
  type CostDetails,
} from './price/priceCalculator' // Импортируем как actualCalculateCost и тип CostDetails
import { PaymentType } from './interfaces/payments.interface' // Импорт PaymentType
import { getBotByName } from './core/bot' // <-- Импортируем функцию
// import type { GenerateModelTrainingDependencies } from '@/modules/digitalAvatarBody/inngest/generateModelTraining' // Тип удален из-за рефакторинга
import { ModeEnum } from '@/interfaces/modes' // Используем этот импорт
import { calculateCost } from '@/price/priceCalculator' // ИСПРАВЛЕН ПУТЬ

// Инициализация ботов
const botInstances: Telegraf<MyContext>[] = []

// Define the commands for private chats
const privateCommands: BotCommand[] = [
  { command: 'start', description: '🚀 Начать / Restart' },
  { command: 'menu', description: '🏠 Главное меню / Main Menu' },

  { command: 'support', description: '💬 Техподдержка / Support' },
]

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

// Создаем функцию-адаптер для calculateCost
const calculateCostAdapter = (params: {
  steps: number
  mode: ModeEnum // mode и другие параметры пока не используются оберткой, но тип должен совпадать
  telegram_id?: string
  bot_name?: string
}): CostDetails => {
  // Вызываем оригинальную функцию с нужным параметром
  return actualCalculateCost(params.steps)
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
    // 👇 Объявляем переменную для API модуля ЗДЕСЬ, чтобы она была доступна позже
    let digitalAvatarModuleAPI: ReturnType<
      typeof initDigitalAvatarBodyModule
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
          // Нашли бота, выходим из цикла, чтобы инициализировать модуль
          break
        }
      } catch (error) {
        // Игнорируем ошибки валидации токенов, просто ищем дальше
      }
    }

    if (!bot || !foundBotInfo) {
      throw new Error(
        `❌ Бот с username '${targetBotUsername}' не найден среди токенов в .env или токен невалиден.`
      )
    }

    // 👇 Инициализируем модуль ПОСЛЕ нахождения бота
    // !!! ИСПРАВЛЕНИЕ ЗАВИСИМОСТЕЙ !!!
    // DigitalAvatarBodyDependencies ожидает только inngest и sendTelegramMessage
    const digitalAvatarDependencies = {
      inngest: inngest,
      sendTelegramMessage: async (
        chatId: string | number,
        text: string,
        extra?: any
      ) => {
        // Используем bot, найденный циклом выше
        if (bot) {
          return await bot.telegram.sendMessage(chatId, text, extra)
        } else {
          logger.error(
            '[Dependencies] Bot instance not found for sendTelegramMessage'
          )
          return Promise.reject('Bot instance not found')
        }
      },
    }
    // Инициализируем API
    digitalAvatarModuleAPI = initDigitalAvatarBodyModule(
      digitalAvatarDependencies // Передаем исправленные зависимости
    )
    logger.info(
      `[Module Init] digitalAvatarBodyModule инициализирован для ${foundBotInfo.username}`
    )

    // 👇 Регистрируем Inngest функции, полученные от модуля
    if (
      digitalAvatarModuleAPI && // Проверяем, что API инициализировано
      digitalAvatarModuleAPI.inngestFunctions &&
      digitalAvatarModuleAPI.inngestFunctions.length > 0
    ) {
      digitalAvatarModuleAPI.inngestFunctions.forEach(funcConfig => {
        // @ts-ignore // Оставляем ts-ignore, так как тип funcConfig может быть сложным
        const createdFunction = inngest.createFunction(funcConfig)
        // 👇 Добавляем функцию НАПРЯМУЮ в импортированный массив
        inngestFunctions.push(createdFunction)
        logger.info(
          `[Inngest Func Add] Функция '${funcConfig.id || funcConfig.name}' добавлена для ${foundBotInfo.username}`
        )
      })
    } else {
      logger.warn(
        `[Inngest Func Add] Модуль digitalAvatarBody не вернул функций для ${foundBotInfo.username}`
      )
    }
    // Добавляем helloWorld функцию в любом случае
    if (!inngestFunctions.includes(helloWorldFunction)) {
      inngestFunctions.push(helloWorldFunction)
      logger.info(
        `[Inngest Func Add] Функция helloWorld добавлена для ${foundBotInfo.username}`
      )
    }

    // Middleware для добавления digitalAvatarAPI в контекст
    // !!! УДАЛЕНИЕ ПРОВЕРКИ startModelTraining И СВЯЗАННОЙ ОШИБКИ !!!
    if (digitalAvatarModuleAPI) {
      // Просто проверяем, что API есть
      const api = digitalAvatarModuleAPI // Копируем в локальную переменную для замыкания
      bot.use((ctx, next) => {
        // 👇 Используем правильное имя свойства из интерфейса MyContext
        ctx.digitalAvatarAPI = api // Передаем весь объект API
        return next()
      })
      logger.info(
        `[Middleware] digitalAvatarAPI добавлен в контекст для ${foundBotInfo.username}`
      )
    } else {
      logger.warn(
        `[Middleware] digitalAvatarModuleAPI не был создан, middleware не добавлен для ${foundBotInfo.username}`
      )
    }

    // Добавляем логи перед регистрацией команд
    console.log(
      '🔄 [SCENE_DEBUG] Регистрация команд бота и stage middleware...'
    )

    // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
    bot.use(session()) // 1. Сессия (из bot.ts)
    registerCommands({ bot }) // 2. Сцены и команды (включая stage.middleware())
    // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
    bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
    bot.on('successful_payment', handleSuccessfulPayment as any)
    // Инициализация обработчиков hears из отдельного файла
    setupHearsHandlers(bot) // 4. Hears (Старые)

    // Обработчик текстовых сообщений по умолчанию - должен быть последним
    bot.on(message('text'), handleTextMessage)
    // <<<---------------------------------------------------->>>

    // <<<--- Set commands scope for the development bot ---<<<\
    try {
      await bot.telegram.setMyCommands(privateCommands, {
        scope: { type: 'all_private_chats' },
      })
      await bot.telegram.setMyCommands([], {
        scope: { type: 'all_group_chats' },
      }) // Empty commands for groups
      await bot.telegram.setMyCommands([], {
        scope: { type: 'all_chat_administrators' },
      }) // Optional: Empty for admins too
      console.log(
        `✅ Команды установлены для тестового бота ${foundBotInfo.username}`
      )
    } catch (error) {
      console.error(
        `❌ Ошибка установки команд для ${foundBotInfo.username}:`,
        error
      )
    }
    // >>>--------------------------------------------------->>>\

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
        bot.use(Composer.log())

        // Инициализация digitalAvatarBodyModule для каждого production бота
        // !!! ИСПРАВЛЕНИЕ ЗАВИСИМОСТЕЙ !!!
        const digitalAvatarDependencies = {
          inngest: inngest,
          // 👇 Исправляем sendTelegramMessage для prod
          sendTelegramMessage: async (
            chatId: string | number,
            messageText: string,
            extra?: any
          ) => {
            // Используем ТОКЕН ТЕКУЩЕГО БОТА для поиска инстанса
            // ВАЖНО: botInstances может быть еще не заполнен на этой итерации.
            // Правильнее использовать текущий инстанс `bot`.
            return bot.telegram.sendMessage(chatId, messageText, extra)
          },
        }
        const currentDigitalAvatarAPI = initDigitalAvatarBodyModule(
          digitalAvatarDependencies // Передаем исправленные зависимости
        )
        const botInfoForLog = await bot.telegram.getMe() // Получаем botInfo для логирования
        logger.info(
          `[Module Init Prod] digitalAvatarBodyModule инициализирован для ${botInfoForLog.username}`
        )

        // 👇 Регистрируем Inngest функции для production бота
        if (
          currentDigitalAvatarAPI.inngestFunctions &&
          currentDigitalAvatarAPI.inngestFunctions.length > 0
        ) {
          currentDigitalAvatarAPI.inngestFunctions.forEach(funcConfig => {
            // @ts-ignore
            const createdFunction = inngest.createFunction(funcConfig)
            // Добавляем только если еще не добавлена (проверка по id/name)
            const alreadyExists = inngestFunctions.some(
              f => (f.id || f.name) === (funcConfig.id || funcConfig.name)
            )
            if (!alreadyExists) {
              inngestFunctions.push(createdFunction)
              logger.info(
                `[Inngest Func Add Prod] Функция '${funcConfig.id || funcConfig.name}' добавлена для ${botInfoForLog.username}`
              )
            }
          })
        } else {
          logger.warn(
            `[Inngest Func Add Prod] Модуль digitalAvatarBody не вернул функций для ${botInfoForLog.username}`
          )
        }
        // Добавляем helloWorld функцию в любом случае, если ее еще нет
        const helloWorldExists = inngestFunctions.some(
          f =>
            (f.id || f.name) ===
            (helloWorldFunction.id || helloWorldFunction.name)
        )
        if (!helloWorldExists) {
          inngestFunctions.push(helloWorldFunction)
          logger.info(
            `[Inngest Func Add Prod] Функция helloWorld добавлена для ${botInfoForLog.username}`
          )
        }

        // Middleware для добавления digitalAvatarAPI в контекст
        // !!! УДАЛЕНИЕ ПРОВЕРКИ startModelTraining !!!
        if (currentDigitalAvatarAPI) {
          // Просто проверяем, что API есть
          bot.use(
            // 👇 Используем правильное имя ctx.digitalAvatarAPI
            (apiInstance => (ctx: MyContext, next: () => Promise<void>) => {
              ctx.digitalAvatarAPI = apiInstance // Передаем весь объект API
              return next()
            })(currentDigitalAvatarAPI)
          )
          logger.info(
            `[Middleware Prod] digitalAvatarAPI добавлен в контекст для ${botInfoForLog.username}`
          )
        } else {
          logger.warn(
            `[Middleware Prod] currentDigitalAvatarAPI не был создан, middleware не добавлен для ${botInfoForLog.username}`
          )
        }

        // <<<--- ВОЗВРАЩАЕМ ПОРЯДОК: stage ПЕРЕД paymentHandlers --->>>
        bot.use(session()) // 1. Сессия (из bot.ts)
        registerCommands({ bot }) // 2. Сцены и команды (включая stage.middleware())
        // 3. Глобальные обработчики платежей (ПОСЛЕ stage)
        bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
        bot.on('successful_payment', handleSuccessfulPayment as any)
        // Инициализация обработчиков hears из отдельного файла
        setupHearsHandlers(bot) // 4. Hears (Старые)

        // Обработчик текстовых сообщений по умолчанию - должен быть последним
        bot.on(message('text'), handleTextMessage)
        // <<<---------------------------------------------------->>>

        botInstances.push(bot)
        const botInfo = await bot.telegram.getMe()
        console.log(`🤖 Бот ${botInfo.username} инициализирован`)

        // <<<--- Set commands scope for the production bot ---<<<\
        try {
          await bot.telegram.setMyCommands(privateCommands, {
            scope: { type: 'all_private_chats' },
          })
          await bot.telegram.setMyCommands([], {
            scope: { type: 'all_group_chats' },
          }) // Empty commands for groups
          await bot.telegram.setMyCommands([], {
            scope: { type: 'all_chat_administrators' },
          }) // Optional: Empty for admins too
          console.log(`✅ Команды установлены для бота ${botInfo.username}`)
        } catch (error) {
          console.error(
            `❌ Ошибка установки команд для ${botInfo.username}:`,
            error
          )
        }
        // >>>---------------------------------------------------->>>\

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
  await new Promise(resolve => setTimeout(resolve, 3000))

  console.log(`[${signal}] Graceful shutdown completed. Exiting.`)
  process.exit(0)
}

// Обрабатываем сигналы завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))

console.log('🏁 Запуск приложения')

// Запускаем API сервер
// Это будет выполнено при старте src/bot.ts
// startApiServer()

// Возвращаем синхронный вызов
initializeBots()
  .then(() => {
    console.log(
      '✅ Боты и API сервер успешно инициализированы (функции Inngest добавлены в массив)'
    )
  })
  .catch(error => {
    console.error('❌ Ошибка при инициализации ботов:', error)
    process.exit(1)
  })
