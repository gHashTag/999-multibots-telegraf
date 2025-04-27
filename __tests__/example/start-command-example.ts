import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации обработчика команды /start.
 */
export function registerExampleStartCommand(bot: Telegraf<Context>) {
  // Используем специальный метод bot.start()
  bot.start(async ctx => {
    try {
      console.log('Received /start command, replying...')
      await ctx.reply('Welcome!')
    } catch (error) {
      console.error('Error in example start handler:', error)
    }
  })
}
