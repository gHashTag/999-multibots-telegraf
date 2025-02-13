import dotenv from 'dotenv'
dotenv.config()

import { Telegraf, Composer } from 'telegraf'
import { MyContext } from '@/interfaces'
import { NODE_ENV } from './config'

import { development, production } from '@/utils/launch'
import express from 'express'
import { registerCallbackActions } from './handlers/сallbackActions'
import { registerPaymentActions } from './handlers/paymentActions'
import { registerHearsActions } from './handlers/hearsActions'
import { registerCommands } from './registerCommands'
import { setBotCommands } from './setCommands'
import { BOT_TOKENS, getBotNameByToken } from './core/bot'

dotenv.config()

const bots = BOT_TOKENS.map(token => new Telegraf<MyContext>(token))
export const composer = new Composer<MyContext>()

export const createBots = async () => {
  bots.forEach((bot, index) => {
    const app = express()

    const port = 3001 + index
    console.log('CASE: port', port)

    setBotCommands(bot)
    registerCommands({ bot, composer })

    registerCallbackActions(bot)
    registerPaymentActions(bot)
    registerHearsActions(bot)

    const telegramToken = bot.telegram.token
    const bot_name = getBotNameByToken(telegramToken)
    console.log('CASE: bot_name', bot_name)

    const webhookPath = `/${bot_name}`

    const webhookUrl = `https://999-multibots-telegraf-u14194.vm.elestio.app`

    if (NODE_ENV === 'development') {
      development(bot)
    } else {
      production(bot, port, webhookUrl, webhookPath)
    }

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
  })
}

createBots()
