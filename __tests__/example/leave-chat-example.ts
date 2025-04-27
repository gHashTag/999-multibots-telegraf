import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации команды, которая заставляет бота покинуть чат.
 */
export function registerExampleLeaveCommand(bot: Telegraf<Context>) {
  bot.command('leave', async ctx => {
    try {
      console.log(`Received /leave command in chat ${ctx.chat?.id}, leaving...`)
      // Вызываем метод контекста для выхода из чата
      await ctx.leaveChat()
      console.log(`Successfully left chat ${ctx.chat?.id}`)
    } catch (error) {
      console.error('Error in example leave handler:', error)
      // Может быть полезно ответить пользователю, если это приватный чат
      if (ctx.chat?.type === 'private') {
        await ctx.reply('Could not leave chat.')
      }
    }
  })
}
