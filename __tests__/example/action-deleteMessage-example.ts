import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации обработчика action, который удаляет сообщение.
 */
export function registerExampleDeleteAction(bot: Telegraf<Context>) {
  bot.action('delete_me', async ctx => {
    try {
      console.log('Received action "delete_me", deleting message...')

      // Сначала отвечаем на callback query
      await ctx.answerCbQuery()

      // Затем удаляем сообщение, к которому была привязана кнопка
      await ctx.deleteMessage()
    } catch (error) {
      console.error('Error in example delete action handler:', error)
      try {
        await ctx.answerCbQuery('Error deleting message')
      } catch {}
    }
  })
}
