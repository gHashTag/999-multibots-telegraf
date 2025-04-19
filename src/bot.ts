import dotenv from 'dotenv'
dotenv.config()

import { Composer, TelegramError } from 'telegraf'
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
import startApiServer from './api'
import { bots } from './core/bot'
import { logger } from '@/utils/logger'

dotenv.config()

export const composer = new Composer<MyContext>()

type NextFunction = (err?: Error) => void

export const createBots = async () => {
  startApiServer()
  logger.info('🚀 Запущен публичный API сервер', {
    description: 'Public API server started',
  })

  if (!process.env.TEST_BOT_NAME) {
    logger.error('❌ TEST_BOT_NAME не установлен', {
      description: 'TEST_BOT_NAME is not set',
    })
    throw new Error('TEST_BOT_NAME is required')
  }

  // В режиме разработки используем только один тестовый бот
  const testBot =
    NODE_ENV === 'development'
      ? bots.find(bot => {
          const { bot_name } = getBotNameByToken(bot.telegram.token)
          return bot_name === process.env.TEST_BOT_NAME
        })
      : null

  const activeBots =
    NODE_ENV === 'development' ? (testBot ? [testBot] : []) : bots

  if (NODE_ENV === 'development' && activeBots.length === 0) {
    logger.error('❌ Тестовый бот не найден', {
      description: 'Test bot not found',
      environment: NODE_ENV,
    })
    throw new Error('Test bot not found')
  }

  activeBots.forEach(async (bot, index) => {
    const telegramToken = bot.telegram.token
    const { bot_name } = getBotNameByToken(telegramToken)
    logger.info('🤖 Попытка запуска бота:', {
      description: 'Attempting to start bot',
      bot_name,
      environment: NODE_ENV,
    })

    // Инициализируем Express приложение для этого бота ЗДЕСЬ
    const app = express()
    const webhookPath = `/${bot_name}` // webhookPath тоже нужен снаружи try

    try {
      // Убираем инициализацию app отсюда
      const port = 3001 + index
      logger.info('🔌 Порт для бота:', {
        description: 'Bot port',
        bot_name,
        port,
      })

      await setBotCommands(bot)
      // Передаем только bot, так как composer больше не используется в registerCommands
      registerCommands({ bot })

      registerCallbackActions(bot)
      registerPaymentActions(bot)
      registerHearsActions(bot)

      // Log every incoming update
      bot.use(async (ctx: MyContext, next) => {
        logger.info('📥 [BOT] Incoming Update:', {
          updateId: ctx.update.update_id,
          type: ctx.updateType,
          userId: ctx.from?.id,
          chatId: ctx.chat?.id,
          sessionMode: ctx.session?.mode, // Log current session mode
          sceneState: ctx.scene?.current?.id, // Log current scene ID
        })
        try {
          await next()
        } catch (error) {
          logger.error('💥 [BOT] Uncaught Error in middleware:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            updateId: ctx.update.update_id,
          })
          // Handle or report error appropriately
        }
      })

      // webhookPath определяется выше
      const webhookUrl = `https://999-multibots-telegraf-u14194.vm.elestio.app`

      if (NODE_ENV === 'development') {
        await development(bot)
      } else {
        await production(bot, port, webhookUrl, webhookPath)
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

      logger.info(`✅ Бот @${bot.botInfo?.username} успешно запущен!`, {
        description: 'Bot started successfully',
        bot_name,
        environment: NODE_ENV,
      })
    } catch (error) {
      if (
        error instanceof TelegramError &&
        error.response?.error_code === 401
      ) {
        logger.error(
          `❌ ОШИБКА ЗАПУСКА: Токен для бота ${bot_name} недействителен (401 Unauthorized). Бот будет пропущен.`,
          {
            description: 'Bot start error: Invalid token (401). Skipping bot.',
            bot_name,
            error: error.message,
            error_code: error.response?.error_code,
          }
        )
        // Не прерываем цикл, просто пропускаем этот бот
      } else {
        // Для других ошибок - прерываем или обрабатываем иначе
        logger.error(`❌ КРИТИЧЕСКАЯ ОШИБКА при запуске бота ${bot_name}:`, {
          description: 'Critical error during bot startup',
          bot_name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        // Можно раскомментировать, если нужно остановить весь процесс при любой другой ошибке
        // throw error;
      }
    }

    // Настройка обработчика вебхуков для Express
    // Теперь app и webhookPath доступны здесь
    app.use(webhookPath, express.json(), (req, res) => {
      logger.info('📨 Получен вебхук:', {
        description: 'Webhook received',
        path: req.path,
        query: req.query,
        bot_expected: bot_name, // Логируем, для какого бота ожидаем вебхук на этом пути
      })

      const botInstance = activeBots.find(
        b => b.telegram.token === telegramToken
      )

      if (botInstance) {
        botInstance.handleUpdate(req.body, res)
      } else {
        logger.error(
          `🚨 Не найден экземпляр бота для обработки вебхука на пути ${webhookPath}`,
          {
            description: 'Bot instance not found for webhook handling',
            webhookPath,
            expected_bot_name: bot_name,
            token_snippet: telegramToken.substring(0, 10) + '...',
          }
        )
        res.status(404).send('Bot instance not found for this path')
      }
    })
  })
}

createBots()
