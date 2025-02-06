import dotenv from 'dotenv'

// Загружаем переменные окружения из .env файла
dotenv.config()
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isDev } from '@/config'

if (!process.env.TELEGRAM_BOT_TOKEN_DEV) {
  throw new Error('TELEGRAM_BOT_TOKEN_DEV is not set')
}

if (!process.env.TELEGRAM_BOT_TOKEN_PROD) {
  throw new Error('TELEGRAM_BOT_TOKEN_PROD is not set')
}

export const BOT_TOKEN = isDev
  ? process.env.TELEGRAM_BOT_TOKEN_DEV
  : process.env.TELEGRAM_BOT_TOKEN_PROD

const bot = new Telegraf<MyContext>(BOT_TOKEN)

export default bot
