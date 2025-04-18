import dotenv from 'dotenv'
dotenv.config()

import { Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { NODE_ENV } from './config'

import { development, production } from '@/utils/launch'
import express from 'express'
import { registerCallbackActions } from './handlers/сallbackActions'
import { registerPaymentActions } from './handlers/paymentActions'
import { registerHearsActions } from './handlers/hearsActions'
import { registerCommands } from './registerCommands'
import { setBotCommands } from './setCommands'
import { getBotNameByToken } from './core/bot'
import { bots, BOT_TOKENS } from './core/bot'
import { logger } from './utils/logger'
import { setupErrorHandler } from './helpers/error/errorHandler'

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
  if (!process.env.TEST_BOT_NAME) {
    logger.error('❌ TEST_BOT_NAME не установлен', {
      description: 'TEST_BOT_NAME is not set',
    })
    throw new Error('TEST_BOT_NAME is required')
  }

  console.log('📊 Режим работы:', NODE_ENV)
  console.log('🤖 Доступные боты:', bots.length)

  // В режиме разработки используем только один тестовый бот
  const testBot =
    NODE_ENV === 'development'
      ? bots.find(bot => {
          const { bot_name } = getBotNameByToken(bot.telegram.token)
          return bot_name === process.env.TEST_BOT_NAME
        })
      : null

  // Определяем активных ботов в зависимости от режима
  const activeBots =
    NODE_ENV === 'development'
      ? testBot
        ? [testBot]
        : []
      : bots.filter(bot => BOT_TOKENS.includes(bot.telegram.token)) // Используем BOT_TOKENS для фильтрации

  if (NODE_ENV === 'development' && activeBots.length === 0) {
    logger.error('❌ Тестовый бот не найден', {
      description: 'Test bot not found',
      environment: NODE_ENV,
    })
    throw new Error('Test bot not found')
  }

  console.log('✅ Активных ботов:', activeBots.length)

  activeBots.forEach((bot, index) => {
    try {
      const app = express()

      // Устанавливаем обработчик ошибок для защиты от проблем с токенами
      setupErrorHandler(bot)

      const port = 3001 + index
      logger.info('🔌 Порт для бота:', {
        description: 'Bot port',
        port,
      })

      // Оборачиваем вызовы в try-catch
      try {
        setBotCommands(bot)
      } catch (commandError) {
        logger.error('❌ Ошибка при установке команд:', {
          description: 'Command setup error',
          bot_name: bot.botInfo?.username || 'unknown',
          error:
            commandError instanceof Error
              ? commandError.message
              : String(commandError),
        })
      }

      try {
        registerCommands({ bot, composer })
      } catch (registerError) {
        logger.error('❌ Ошибка при регистрации команд:', {
          description: 'Command registration error',
          bot_name: bot.botInfo?.username || 'unknown',
          error:
            registerError instanceof Error
              ? registerError.message
              : String(registerError),
        })
      }

      try {
        registerCallbackActions(bot)
        registerPaymentActions(bot)
        registerHearsActions(bot)
      } catch (actionsError) {
        logger.error('❌ Ошибка при регистрации обработчиков:', {
          description: 'Action registration error',
          bot_name: bot.botInfo?.username || 'unknown',
          error:
            actionsError instanceof Error
              ? actionsError.message
              : String(actionsError),
        })
      }

      const telegramToken = bot.telegram.token
      const { bot_name } = getBotNameByToken(telegramToken)
      logger.info('🤖 Запускается бот:', {
        description: 'Starting bot',
        bot_name,
        environment: NODE_ENV,
      })

      const webhookPath = `/${bot_name}`
      const webhookUrl = `https://999-multibots-telegraf-u14194.vm.elestio.app${webhookPath}`

      try {
        if (NODE_ENV === 'development') {
          development(bot)
        } else {
          production(bot, port, webhookUrl, webhookPath)
        }
      } catch (launchError) {
        logger.error('❌ Ошибка при запуске бота:', {
          description: 'Bot launch error',
          bot_name,
          error:
            launchError instanceof Error
              ? launchError.message
              : String(launchError),
        })
      }

      bot.use((ctx: MyContext, next: NextFunction) => {
        logger.info('🔍 Получено сообщение/команда:', {
          description: 'Message/command received',
          text:
            ctx.message && 'text' in ctx.message ? ctx.message.text : undefined,
          from: ctx.from?.id,
          chat: ctx.chat?.id,
          bot: ctx.botInfo?.username,
          timestamp: new Date().toISOString(),
        })
        return next()
      })

      app.use(webhookPath, express.json(), (req, res) => {
        logger.info('📨 Получен вебхук:', {
          description: 'Webhook received',
          query: req.query,
        })

        const token = req.query.token as string
        const bot = activeBots.find(b => b.telegram.token === token)

        if (bot) {
          bot.handleUpdate(req.body, res)
        } else {
          res.status(404).send('Bot not found')
        }
      })
    } catch (error) {
      // Обработка общих ошибок при инициализации бота
      logger.error('❌ Критическая ошибка при инициализации бота:', {
        description: 'Critical bot initialization error',
        index,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

console.log('🏁 Запуск приложения')
createBots()
  .then(() => console.log('✅ Боты успешно запущены'))
  .catch(error => console.error('❌ Ошибка при запуске ботов:', error))
