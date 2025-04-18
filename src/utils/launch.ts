import { Telegraf } from 'telegraf'
import express from 'express'
import { MyContext } from '@/interfaces'
import { removeWebhooks } from './removeWebhooks'
import { logger } from '@/utils/logger'

/**
 * Запускает бота в режиме разработки (polling)
 * @param bot Экземпляр бота
 */
export async function development(bot: Telegraf<MyContext>) {
  try {
    // Удаляем вебхук перед запуском в режиме polling
    await bot.telegram.deleteWebhook()
    await bot.launch()
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

/**
 * Запускает бота в режиме продакшн (webhook)
 * @param bot Экземпляр бота
 * @param port Порт для запуска сервера
 * @param url URL вебхука
 * @param path Путь для вебхука
 */
export async function production(
  bot: Telegraf<MyContext>,
  port: number,
  url: string,
  path: string
) {
  try {
    // Удаляем старые вебхуки
    await removeWebhooks(bot)

    // Проверяем, что бот доступен
    await bot.telegram.getMe()

    // Устанавливаем новый вебхук
    await bot.telegram.setWebhook(url, {
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
    })

    // Проверяем информацию о вебхуке
    const webhookInfo = await bot.telegram.getWebhookInfo()
    logger.info('📡 Информация о вебхуке:', {
      description: 'Webhook info',
      bot_name: bot.botInfo?.username,
      url: webhookInfo.url,
      has_custom_certificate: webhookInfo.has_custom_certificate,
      pending_update_count: webhookInfo.pending_update_count,
    })

    // Настраиваем Express сервер
    const app = express()
    app.use(express.json())

    // Добавляем обработчик вебхука
    app.use(path, async (req, res) => {
      try {
        await bot.handleUpdate(req.body, res)
      } catch (error) {
        logger.error('❌ Ошибка обработки вебхука:', {
          description: 'Webhook handling error',
          bot_name: bot.botInfo?.username,
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).send('Webhook handling error')
      }
    })

    // Запускаем сервер
    app.listen(port, () => {
      logger.info('✅ Бот слушает вебхуки:', {
        description: 'Bot webhook listening',
        bot_name: bot.botInfo?.username,
        port,
        path,
      })
    })
  } catch (error) {
    logger.error('❌ Ошибка запуска бота в режиме продакшн:', {
      description: 'Production launch error',
      bot_name: bot.botInfo?.username,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
