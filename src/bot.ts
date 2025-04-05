import dotenv from 'dotenv'
dotenv.config()

import { Telegraf, Composer } from 'telegraf'
import { MyContext, MyTextMessageContext } from '@/interfaces'
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

  // В режиме разработки используем только тестовые боты
  const activeBots =
    NODE_ENV === 'development'
      ? bots.filter(bot => {
          const { bot_name } = getBotNameByToken(bot.telegram.token)
          return bot_name === 'ai_koshey_bot'
        })
      : bots

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
      environment: NODE_ENV,
    })

    const webhookPath = `/${bot_name}`
    const webhookUrl = `https://999-multibots-telegraf-u14194.vm.elestio.app`

    if (NODE_ENV === 'development') {
      development(bot)
    } else {
      production(bot, port, webhookUrl, webhookPath)
    }

    bot.use((ctx: MyTextMessageContext, next: NextFunction) => {
      logger.info('🔍 Получено сообщение/команда:', {
        description: 'Message/command received',
        text: ctx.message?.text,
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
