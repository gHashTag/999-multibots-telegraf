import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from './logger'

const production = async (
  bot: Telegraf<MyContext>,
  port: number,
  webhookUrl: string,
  path: string
): Promise<void> => {
  try {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true })
      console.log('Old webhook deleted')
    } catch (e) {
      // Логируем ошибку, но не прерываем процесс
      logger.error('Ошибка при удалении вебхука:', {
        description: 'Webhook deletion error',
        error: e.message,
        bot: bot.botInfo?.username || 'unknown',
      })
    }

    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      bot.launch({
        webhook: {
          domain: webhookUrl,
          port,
          path,
          secretToken: process.env.SECRET_TOKEN,
        },
      })
    } catch (e) {
      // Логируем ошибку запуска вебхука, но не прерываем весь процесс
      logger.error('Ошибка при запуске вебхука:', {
        description: 'Webhook launch error',
        error: e.message,
        bot: bot.botInfo?.username || 'unknown',
      })
    }
    return
  } catch (e) {
    console.error('Error in production setup:', e)
    // Логируем ошибку, но не пробрасываем её дальше
    logger.error('Критическая ошибка настройки в производственном режиме:', {
      description: 'Production setup critical error',
      error: e.message,
      stack: e.stack,
      bot: bot.botInfo?.username || 'unknown',
    })
  }
}

const development = async (bot: Telegraf<MyContext>): Promise<void> => {
  try {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true })
      console.log('[SERVER] Webhook deleted, starting polling...')
    } catch (e) {
      // Логируем ошибку, но не прерываем процесс
      logger.error('Ошибка при удалении вебхука в режиме разработки:', {
        description: 'Development webhook deletion error',
        error: e.message,
        bot: bot.botInfo?.username || 'unknown',
      })
    }

    await new Promise(resolve => setTimeout(resolve, 1000))

    try {
      bot.launch()
    } catch (e) {
      // Логируем ошибку запуска в режиме разработки
      logger.error('Ошибка при запуске бота в режиме разработки:', {
        description: 'Development launch error',
        error: e.message,
        bot: bot.botInfo?.username || 'unknown',
      })
    }
    return
  } catch (e) {
    console.error('Error in development setup:', e)
    // Логируем ошибку, но не пробрасываем её дальше
    logger.error('Критическая ошибка настройки в режиме разработки:', {
      description: 'Development setup critical error',
      error: e.message,
      stack: e.stack,
      bot: bot.botInfo?.username || 'unknown',
    })
  }
}

export { production, development }
