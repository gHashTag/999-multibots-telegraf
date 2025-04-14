import dotenv from 'dotenv'
dotenv.config()

import { Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isDev } from './config/index'

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

  if (!process.env.DEV_BOT_NAME) {
    logger.error('❌ DEV_BOT_NAME не установлен', {
      description: 'DEV_BOT_NAME is not set',
    })
    throw new Error('DEV_BOT_NAME is required')
  }

  // В режиме разработки используем только один тестовый бот
  const testBot = isDev
    ? bots.find(bot => {
        const { bot_name } = getBotNameByToken(bot.telegram.token)
        return bot_name === process.env.DEV_BOT_NAME
      })
    : null

  const activeBots = isDev ? (testBot ? [testBot] : []) : bots

  if (isDev && activeBots.length === 0) {
    logger.error('❌ Тестовый бот не найден', {
      description: 'Test bot not found',
      environment: process.env.NODE_ENV,
    })
    throw new Error('Test bot not found')
  }

  activeBots.forEach((bot, index) => {
    const app = express()

    const port = 3001 + index
    logger.info('🔌 Порт для бота:', {
      description: 'Bot port',
      port,
    })

    setBotCommands(bot)
    registerCommands({ bot, composer })

    registerCallbackActions(bot)
    registerPaymentActions(bot)
    registerHearsActions(bot)

    const telegramToken = bot.telegram.token
    const { bot_name } = getBotNameByToken(telegramToken)
    logger.info('🤖 Запускается бот:', {
      description: 'Starting bot',
      bot_name,
      environment: process.env.NODE_ENV,
    })

    const webhookPath = `/${bot_name}`
    const webhookUrl = `https://999-multibots-telegraf-u14194.vm.elestio.app`

    if (isDev) {
      development(bot)
    } else {
      production(bot, port, webhookUrl, webhookPath)
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
  })
}

createBots()
