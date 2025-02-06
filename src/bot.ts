import dotenv from 'dotenv'
dotenv.config()

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
// import { isDev } from '@/config'
// import { handleModelCallback } from './handlers'

// import { setBotCommands } from './setCommands'
// import { registerCommands, stage } from './registerCommands'
// import { handleCallback } from './handlers/handleCallback'

import { NODE_ENV } from './config'
// import { handlePaymentPolicyInfo } from './handlers/paymentHandlers/handlePaymentPolicyInfo'
// import { handlePreCheckoutQuery } from './handlers/paymentHandlers/handlePreCheckoutQuery'
// import { handleTopUp } from './handlers/paymentHandlers/handleTopUp'
// import { handleSuccessfulPayment } from './handlers/paymentHandlers'
import { development, production } from '@/utils/launch'
import express from 'express'

// Загружаем переменные окружения из .env файла
dotenv.config()

if (!process.env.BOT_TOKEN_1) {
  throw new Error('BOT_TOKEN_1 is not set')
}

if (!process.env.BOT_TOKEN_2) {
  throw new Error('BOT_TOKEN_2 is not set')
}

const BOT_TOKENS = [process.env.BOT_TOKEN_1, process.env.BOT_TOKEN_2]
const bots = BOT_TOKENS.map(token => new Telegraf<MyContext>(token))

export const createBots = async () => {
  bots.forEach((bot, index) => {
    const app = express()
    const PORT = 3001 + index
    console.log('PORT', PORT)

    bot.on('text', ctx => {
      const userMessage = ctx.message.text
      const botResponse = `I am bot${index + 1}, you said: ${userMessage}`
      ctx.reply(botResponse)
    })

    const webhookPath = '/webhook'

    if (NODE_ENV === 'development') {
      development(bot)
    } else {
      production(bot, PORT + index)
    }

    // Обрабатываем запросы вебхука
    app.use(webhookPath, express.json(), (req, res) => {
      console.log('CASE: production')
      console.log('req.query', req.query)

      const token = req.query.token as string
      const bot = bots.find(b => b.telegram.token === token)

      if (bot) {
        bot.handleUpdate(req.body, res)
      } else {
        res.status(404).send('Bot not found')
      }
    })

    app.listen(PORT, () => {
      console.log(`Bot ${index + 1} is running on port ${PORT}`)
    })
  })
}

createBots()
