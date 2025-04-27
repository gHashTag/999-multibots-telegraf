import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации обработчика action, который редактирует сообщение.
 */
export function registerExampleEditAction(bot: Telegraf<Context>) {
  bot.action('edit_me', async ctx => {
    try {
      console.log('Received action "edit_me", editing message text...')

      // Сначала отвечаем на callback query
      await ctx.answerCbQuery()

      // Затем редактируем текст исходного сообщения
      await ctx.editMessageText('Text was edited!')
    } catch (error) {
      console.error('Error in example edit action handler:', error)
      // Попытаться ответить на callback query с ошибкой, если возможно
      try {
        await ctx.answerCbQuery('Error editing message')
      } catch {}
    }
  })
}
