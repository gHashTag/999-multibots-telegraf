import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

const production = async (
  bot: Telegraf<MyContext>,
  port: number,
  webhookUrl: string,
  path: string
): Promise<void> => {
  try {
    logger.info('🔄 Удаляем старый вебхук...', {
      description: 'Deleting old webhook',
      webhookUrl,
      path,
    })

    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    logger.info('✅ Старый вебхук удален', {
      description: 'Old webhook deleted',
    })

    // Ждем 3 секунды перед установкой нового вебхука
    await new Promise(resolve => setTimeout(resolve, 3000))

    logger.info('🔄 Устанавливаем новый вебхук...', {
      description: 'Setting up new webhook',
      webhookUrl,
      path,
    })

    await bot.launch({
      webhook: {
        domain: webhookUrl,
        port,
        path,
        secretToken: process.env.SECRET_TOKEN,
      },
    })

    logger.info('✅ Бот запущен в режиме webhook', {
      description: 'Bot launched in webhook mode',
      webhookUrl,
      path,
    })

    return
  } catch (e) {
    logger.error('❌ Ошибка при настройке production режима:', {
      description: 'Error in production setup',
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

const development = async (bot: Telegraf<MyContext>): Promise<void> => {
  try {
    logger.info('🔄 Удаляем вебхук для development режима...', {
      description: 'Deleting webhook for development mode',
    })

    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    logger.info('✅ Вебхук удален, запускаем polling...', {
      description: 'Webhook deleted, starting polling',
    })

    // Ждем 2 секунды перед запуском polling
    await new Promise(resolve => setTimeout(resolve, 2000))

    await bot.launch()
    logger.info('✅ Бот запущен в режиме polling', {
      description: 'Bot launched in polling mode',
    })

    return
  } catch (e) {
    logger.error('❌ Ошибка при настройке development режима:', {
      description: 'Error in development setup',
      error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

export { production, development }
