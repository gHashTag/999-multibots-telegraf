import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

const production = async (
  bot: Telegraf<MyContext>,
  port: number
): Promise<void> => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    console.log('Old webhook deleted')

    await new Promise(resolve => setTimeout(resolve, 2000))

    const webhookUrl = process.env.WEBHOOK_URL

    bot.launch({
      webhook: {
        domain: webhookUrl,
        port,
        path: '/webhook',
        secretToken: process.env.SECRET_TOKEN,
      },
    })

    console.log(`Webhook successfully set to ${webhookUrl}`)
    console.log('Bot is running in webhook mode')
    return
  } catch (e) {
    console.error('Error in production setup:', e)
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
