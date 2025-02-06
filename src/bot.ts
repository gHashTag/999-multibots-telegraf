import dotenv from 'dotenv'
dotenv.config()

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { NODE_ENV } from './config'

import { development, production } from '@/utils/launch'
import express from 'express'

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

    const port = 3000 + index
    console.log('CASE: port', port)

    bot.on('text', ctx => {
      console.log('CASE: text', ctx)
      const userMessage = ctx.message.text
      const botResponse = `I am bot${index + 1}, you said: ${userMessage}`
      ctx.reply(botResponse)
    })

    const webhookPath = `/${bot.telegram.token}`
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
