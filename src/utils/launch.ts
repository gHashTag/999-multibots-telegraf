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

    // Получаем информацию о текущем webhook
    const webhookInfo = await bot.telegram.getWebhookInfo()

    if (webhookInfo.url) {
      logger.info('📡 Обнаружен активный webhook:', {
        description: 'Active webhook detected',
        url: webhookInfo.url,
        has_custom_certificate: webhookInfo.has_custom_certificate,
        pending_update_count: webhookInfo.pending_update_count,
      })
    }

    // Принудительно удаляем webhook с опцией drop_pending_updates
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })

    // Дополнительная проверка удаления webhook
    const webhookInfoAfter = await bot.telegram.getWebhookInfo()

    if (webhookInfoAfter.url) {
      logger.warn('⚠️ Не удалось полностью удалить webhook:', {
        description: 'Failed to completely remove webhook',
        url: webhookInfoAfter.url,
      })

      // Повторная попытка удаления
      await bot.telegram.deleteWebhook({ drop_pending_updates: true })

      // Даем Telegram API время на обработку запроса
      await new Promise(resolve => setTimeout(resolve, 3000))
    } else {
      logger.info('✅ Вебхук успешно удален', {
        description: 'Webhook successfully deleted',
      })
    }

    // Ждем дополнительное время перед запуском polling
    await new Promise(resolve => setTimeout(resolve, 2000))

    logger.info('🚀 Запускаем бота в режиме polling...', {
      description: 'Starting bot in polling mode',
    })

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
