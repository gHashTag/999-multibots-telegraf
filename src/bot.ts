import dotenv from 'dotenv'
dotenv.config()

import { Composer, Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isDev } from '@/config'
import { handleModelCallback } from './handlers'

import { setBotCommands } from './setCommands'
import { registerCommands, stage } from './registerCommands'
import { handleCallback } from './handlers/handleCallback'

import { NODE_ENV } from './config'
import { handlePaymentPolicyInfo } from './handlers/paymentHandlers/handlePaymentPolicyInfo'
import { handlePreCheckoutQuery } from './handlers/paymentHandlers/handlePreCheckoutQuery'
import { handleTopUp } from './handlers/paymentHandlers/handleTopUp'
import { handleSuccessfulPayment } from './handlers/paymentHandlers'
import { development, production } from '@/utils/launch'

// Загружаем переменные окружения из .env файла
dotenv.config()

if (!process.env.BOT_TOKEN_1) {
  throw new Error('BOT_TOKEN_1 is not set')
}

if (!process.env.BOT_TOKEN_2) {
  throw new Error('BOT_TOKEN_2 is not set')
}

// Создаем массив токенов для ботов
const BOT_TOKENS = [process.env.BOT_TOKEN_1, process.env.BOT_TOKEN_2]

// Инициализируем ботов
const bots = BOT_TOKENS.map(token => new Telegraf<MyContext>(token))

export const createBots = async () => {
  // Определяем логику для каждого бота
  bots.forEach((bot, index) => {
    bot.on('text', ctx => {
      const userMessage = ctx.message.text // Получаем сообщение от пользователя
      const botResponse = `I am bot${index + 1}, you said: ${userMessage}` // Формируем ответ бота
      ctx.reply(botResponse) // Отправляем ответ пользователю
    })
  })

  console.log(`NODE_ENV: ${NODE_ENV}`) // Логирование значения NODE_ENV

  if (NODE_ENV === 'development') {
    console.log('Starting bots in development mode...')
    await Promise.all(bots.map(bot => development(bot)))
  } else {
    console.log('Starting bots in production mode...')
    await Promise.all(bots.map((bot, index) => production(bot, 3000 + index)))
  }
}

createBots()
