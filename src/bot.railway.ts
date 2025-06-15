import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { session } from 'telegraf'
import { registerCommands } from './registerCommands'
import { setBotCommands } from './setCommands'
import { setupStatsCommand } from './commands/statsCommand'
import { handleTextMessage } from './handlers/handleTextMessage'
import { message } from 'telegraf/filters'
import { startApiServer } from './api_server'
import { setupHearsHandlers } from './hearsHandlers'
import {
  handleSuccessfulPayment,
  handlePreCheckoutQuery,
} from './handlers/paymentHandlers'

console.log('🚂 Starting NeuroBlogger Bot on Railway')

// Railway configuration
const PORT = parseInt(process.env.PORT || '3000')
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.BOT_TOKEN_1

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is required!')
  process.exit(1)
}

async function startBot() {
  try {
    const bot = new Telegraf<MyContext>(BOT_TOKEN, {
      handlerTimeout: Infinity,
    })

    // Get bot info
    const botInfo = await bot.telegram.getMe()
    console.log(`🤖 Starting bot: @${botInfo.username}`)

    // Setup middlewares and handlers
    bot.use(session())
    bot.use(Telegraf.log(console.log))

    registerCommands({ bot })
    setupStatsCommand(bot)

    bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
    bot.on('successful_payment', handleSuccessfulPayment as any)

    setupHearsHandlers(bot)
    bot.on(message('text'), handleTextMessage)

    // Set bot commands
    await setBotCommands(bot)

    // Setup webhook for Railway
    const WEBHOOK_DOMAIN =
      process.env.RAILWAY_PUBLIC_DOMAIN || process.env.WEBHOOK_DOMAIN

    if (WEBHOOK_DOMAIN) {
      // Production mode with webhook
      const webhookPath = `/webhook/${BOT_TOKEN}`

      await bot.launch({
        webhook: {
          domain: `https://${WEBHOOK_DOMAIN}`,
          port: PORT,
          hookPath: webhookPath,
        },
        allowedUpdates: [
          'message',
          'callback_query',
          'pre_checkout_query' as any,
          'successful_payment' as any,
        ],
      })

      console.log(
        `🚀 Bot launched with webhook at https://${WEBHOOK_DOMAIN}${webhookPath}`
      )
    } else {
      // Development mode with polling
      bot.launch({
        allowedUpdates: [
          'message',
          'callback_query',
          'pre_checkout_query' as any,
          'successful_payment' as any,
        ],
      })

      console.log('🚀 Bot launched in polling mode')
    }

    // Start API server
    startApiServer()

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'))
    process.once('SIGTERM', () => bot.stop('SIGTERM'))
  } catch (error) {
    console.error('❌ Failed to start bot:', error)
    process.exit(1)
  }
}

// Start the bot
startBot().catch(console.error)
