import { Telegraf } from 'telegraf'
// Импорты ниже были нужны для удаляемой функции `production`, использующей Fastify.
// Они не требуются, так как Telegraf сам запускает серверы для webhook.
// import { IncomingMessage, ServerResponse } from 'http'
// import fastify from 'fastify'
// import fastifyExpress from '@fastify/express'
import { MyContext } from '@/interfaces'
// import { removeWebhooks } from './removeWebhooks' // Больше не используется
import { logger } from './logger'

/**
 * Запускает бота в режиме разработки (polling)
 * @param bot Экземпляр бота
 */
export async function development(bot: Telegraf<MyContext>) {
  try {
    // Удаляем вебхук перед запуском в режиме polling
    await bot.telegram.deleteWebhook()
    await bot.launch() // Использует Long Polling
    logger.info('✅ Бот запущен в режиме разработки:', {
      description: 'Bot launched in development mode',
      bot_name: bot.botInfo?.username,
    })
  } catch (error) {
    logger.error('❌ Ошибка запуска бота в режиме разработки:', {
      description: 'Development launch error',
      bot_name: bot.botInfo?.username,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// ==========================================================================
// !!! НАЧАЛО УДАЛЯЕМОГО КОДА !!!
// Функция `production` ниже НЕ НУЖНА.
// В файле `src/bot.ts` используется `bot.launch({ webhook: { port: currentPort, ... } })`,
// который САМ запускает HTTP-сервер Telegraf для КАЖДОГО бота на своем порту (3001, 3002,...).
// Отдельный сервер на порту 2999 (как пыталась сделать эта функция) не требуется и не запускался (см. вывод `netstat`).
// Ошибки `Connection refused` в Nginx были связаны с тем, что порт 2999 не слушался,
// а соединение с портами 3001-3007 могло быть нестабильным из-за потенциальных конфликтов или ошибок
// в этом (теперь удаляемом) коде.
// ==========================================================================
/*
export async function production(
  bot: Telegraf<MyContext>,
  port: number,
  url: string,
  path: string
) {
  // ... (весь код функции `production` удален)
}
*/

// ==========================================================================
// !!! НАЧАЛО УДАЛЯЕМОГО КОДА !!!
// Заглушка `launch` также больше не нужна, так как функция `production` удалена.
// ==========================================================================
/*
export const launch = {
  init: () => {
    console.log('Launch module initialized')
    return true
  },
  configureWebhook: (options: any) => {
    console.log('Webhook configured with options:', options)
    return true
  },
  configureLongPolling: (options: any) => {
    console.log('Long polling configured with options:', options)
    return true
  },
}
export default launch
*/
// ==========================================================================
// !!! КОНЕЦ УДАЛЯЕМОГО КОДА !!!
// ==========================================================================
