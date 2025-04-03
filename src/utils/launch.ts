import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

const production = async (
  bot: Telegraf<MyContext>,
  port: number,
  webhookUrl: string,
  path: string
): Promise<void> => {
  try {
    console.log('🔄 Удаление старого вебхука...', {
      description: 'Deleting old webhook',
      webhookUrl,
      path,
    })

    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    console.log('✅ Старый вебхук удален', {
      description: 'Old webhook deleted',
    })

    await new Promise(resolve => setTimeout(resolve, 10000))

    console.log('🚀 Запуск бота с новым вебхуком...', {
      description: 'Launching bot with new webhook',
      webhookUrl,
      path,
      port,
    })

    bot.launch({
      webhook: {
        domain: webhookUrl,
        port,
        path,
        secretToken: process.env.SECRET_TOKEN,
      },
    })
    return
  } catch (e) {
    console.error('❌ Ошибка при настройке продакшн:', {
      description: 'Error in production setup',
      error: e,
    })
    throw e
  }
}

const development = async (bot: Telegraf<MyContext>): Promise<void> => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    console.log('[SERVER] Webhook deleted, starting polling...')
    await new Promise(resolve => setTimeout(resolve, 1000))

    bot.launch()
    return
  } catch (e) {
    console.error('Error in development setup:', e)
    throw e
  }
}

export { production, development }
