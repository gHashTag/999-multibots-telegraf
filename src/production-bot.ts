/**
 * Production Bot - запускает ВСЕХ ботов в polling режиме
 * Не изменяет main bot.ts файл
 */

import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { isDev, setupSafeConsoleLogging } from './config'
import { setupErrorHandler } from './core/errorHandler'
import { setupNotificationProcessor } from './core/notification-processor'
import { registerCommands, setupStatsCommand } from './core/commands'
import { languageMiddleware } from './middlewares/language'
import { session } from 'telegraf-session-mysql2'
import {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
} from './handlers/payments'
import { getBotInfo, validateBotToken } from './core/bot'
import { startApiServer } from './api_server'

setupSafeConsoleLogging()

async function startProductionPolling() {
  console.log('🚀 PRODUCTION POLLING: Запуск всех ботов в polling режиме')

  // Запускаем всех ботов как в webhook режиме, но с polling
  const botTokens = [
    process.env.BOT_TOKEN_1,
    process.env.BOT_TOKEN_2,
    process.env.BOT_TOKEN_3,
    process.env.BOT_TOKEN_4,
    process.env.BOT_TOKEN_5,
    process.env.BOT_TOKEN_6,
    process.env.BOT_TOKEN_7,
    process.env.BOT_TOKEN_8,
    process.env.BOT_TOKEN_9,
    process.env.BOT_TOKEN_10,
  ].filter((token): token is string => Boolean(token))

  const currentPort = 3001

  for (const [index, token] of botTokens.entries()) {
    if (await validateBotToken(token)) {
      const bot = new Telegraf<MyContext>(token, {
        handlerTimeout: Infinity,
      })
      bot.use(Telegraf.log(console.log))

      bot.use(session())
      bot.use(languageMiddleware)

      setupErrorHandler(bot)
      setupNotificationProcessor(bot)

      registerCommands({ bot })
      setupStatsCommand(bot)
      bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
      bot.on('successful_payment', handleSuccessfulPayment as any)

      await bot.telegram.deleteWebhook()

      const botInfo = await getBotInfo(token)
      console.log(`🔄 Запуск бота ${botInfo.username} в polling режиме на порту ${currentPort + index}`)

      await bot.launch({
        allowedUpdates: [
          'message',
          'callback_query',
          'pre_checkout_query' as any,
          'successful_payment' as any,
        ],
      })
      console.log(`🚀 Бот ${botInfo.username} запущен в polling режиме на порту ${currentPort + index}`)
    }
  }

  // API сервер все равно запускается
  await startApiServer()
  console.log('✅ Все боты и API сервер успешно запущены в production polling режиме')
}

// Запуск только если файл выполняется напрямую
if (require.main === module) {
  startProductionPolling().catch((error) => {
    console.error('❌ Критическая ошибка production polling:', error)
    process.exit(1)
  })
}

export { startProductionPolling }
