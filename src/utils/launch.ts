import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createServer } from 'http'

const production = async (
  bot: Telegraf<MyContext>,
  port: number,
  webhookUrl: string,
  path: string
): Promise<void> => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true })
    console.log('Old webhook deleted')

    await new Promise(resolve => setTimeout(resolve, 2000))

    const server = createServer(
      await bot.createWebhook({ domain: `${webhookUrl}${path}` })
    ).listen(port)

    console.log(`Webhook successfully set to ${webhookUrl}`)
    console.log('Bot is running in webhook mode')
    server.on('listening', () => {
      console.log(`Bot is running on port ${port}`)
    })
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
