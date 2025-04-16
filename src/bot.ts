import dotenv from 'dotenv'
dotenv.config()

import { Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { NODE_ENV } from './config'

import { startServer } from '@/utils/launch'
import { registerCallbackActions } from './handlers/сallbackActions'
import { registerPaymentActions } from './handlers/paymentActions'
import { registerHearsActions } from './handlers/hearsActions'
import { registerCommands } from './registerCommands'
import { setBotCommands } from './setCommands'
import { logger } from './utils/logger'
import { setupErrorHandler } from './helpers/error/errorHandler'
import init from './core/bot'

dotenv.config()

// Логирование для отладки
console.log('📂 bot.ts загружен', { NODE_ENV, cwd: process.cwd() })
console.log('🔑 Переменные окружения:', {
  TEST_BOT_NAME: process.env.TEST_BOT_NAME,
  NODE_ENV: process.env.NODE_ENV,
})

export const composer = new Composer<MyContext>()

type NextFunction = (err?: Error) => void

export const createBots = async () => {
  console.log('🚀 Запуск createBots()')
  logger.info('🚀 Начало инициализации ботов', {
    node_env: NODE_ENV,
    cwd: process.cwd(),
    available_env_keys: Object.keys(process.env).filter(key =>
      key.includes('BOT_TOKEN')
    ),
  })

  // Запуск сервера Express для обработки вебхуков
  const serverStarted = await startServer()
  if (!serverStarted) {
    logger.error('❌ Не удалось запустить Express сервер')
    throw new Error('Failed to start Express server')
  }
  logger.info('✅ Express сервер успешно запущен')

  if (NODE_ENV === 'development' && !process.env.TEST_BOT_NAME) {
    logger.error('❌ TEST_BOT_NAME не установлен в режиме разработки', {
      description: 'TEST_BOT_NAME is not set',
    })
    throw new Error('TEST_BOT_NAME is required for development mode')
  }

  logger.info('📊 Режим работы:', { mode: NODE_ENV })

  // Инициализация ботов с помощью обновленного метода
  logger.info('🔄 Инициализация списка ботов...')
  const botList = await init()
  logger.info('🤖 Доступные боты после инициализации:', {
    count: botList.length,
    bot_ids: botList.map(b => b.id),
  })

  // В режиме разработки используем только один тестовый бот
  const testBotName = process.env.TEST_BOT_NAME
  const activeBots =
    NODE_ENV === 'development'
      ? botList.filter(({ id }) => id === testBotName)
      : botList

  logger.info('🔍 Фильтрация ботов для режима:', {
    mode: NODE_ENV,
    test_bot_name: testBotName,
    filtered_count: activeBots.length,
    active_bot_ids: activeBots.map(b => b.id),
  })

  if (NODE_ENV === 'development' && activeBots.length === 0) {
    logger.error(
      '❌ Тестовый бот не найден в списке инициализированных ботов',
      {
        description: 'Test bot not found',
        environment: NODE_ENV,
        requested_bot: testBotName,
        available_bots: botList.map(b => b.id),
      }
    )
    throw new Error(`Test bot '${testBotName}' not found`)
  }

  logger.info('✅ Активных ботов:', {
    count: activeBots.length,
    bots: activeBots.map(b => b.id),
  })

  // Настройка каждого бота
  activeBots.forEach(({ bot, id }) => {
    logger.info(`🔄 Настройка бота: ${id}`)

    // Устанавливаем обработчик ошибок для защиты от проблем с токенами
    setupErrorHandler(bot)
    logger.info(`✅ [${id}] Обработчик ошибок установлен`)

    // Настройка команд и обработчиков
    setBotCommands(bot)
    logger.info(`✅ [${id}] Команды бота установлены`)

    registerCommands({ bot, composer })
    logger.info(`✅ [${id}] Обработчики команд зарегистрированы`)

    registerCallbackActions(bot)
    logger.info(`✅ [${id}] Обработчики колбэков зарегистрированы`)

    registerPaymentActions(bot)
    logger.info(`✅ [${id}] Обработчики платежей зарегистрированы`)

    registerHearsActions(bot)
    logger.info(`✅ [${id}] Обработчики текстовых сообщений зарегистрированы`)

    // Добавляем логирование для входящих сообщений
    bot.use((ctx: MyContext, next: NextFunction) => {
      logger.info('🔍 Получено сообщение/команда:', {
        description: 'Message/command received',
        text:
          ctx.message && 'text' in ctx.message ? ctx.message.text : undefined,
        from: ctx.from?.id,
        chat: ctx.chat?.id,
        bot: ctx.botInfo?.username,
        update_type: ctx.updateType,
        timestamp: new Date().toISOString(),
      })
      return next()
    })

    logger.info(`✅ [${id}] Бот полностью настроен и готов к работе`)
  })

  logger.info('🏁 Все боты успешно настроены и запущены!')
}

console.log('🏁 Запуск приложения')
createBots()
  .then(() => console.log('✅ Боты успешно запущены'))
  .catch(error => console.error('❌ Ошибка при запуске ботов:', error))
