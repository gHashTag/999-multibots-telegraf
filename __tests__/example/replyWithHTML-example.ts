import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации команды, которая отвечает HTML.
 */
export function registerExampleHTMLCommand(bot: Telegraf<Context>) {
  bot.command('html', async ctx => {
    try {
      console.log('Received /html command, replying with HTML...')
      const htmlMessage = '<b>Hello</b> <i>World!</i>'
      await ctx.replyWithHTML(htmlMessage)
    } catch (error) {
      console.error('Error in example html handler:', error)
    }
  })
}
