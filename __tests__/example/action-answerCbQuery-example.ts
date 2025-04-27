import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации обработчика action, который отвечает на callback query.
 */
export function registerExampleAction(bot: Telegraf<Context>) {
  // Регистрируем обработчик для конкретного action data
  bot.action('test_action', async ctx => {
    try {
      console.log('Received action "test_action", answering callback query...')
      // Отвечаем на callback query (например, чтобы убрать 'часики' на кнопке)
      await ctx.answerCbQuery('Action received!')

      // Здесь может быть дальнейшая логика, например, редактирование сообщения:
      // await ctx.editMessageText('You clicked the button!');
    } catch (error) {
      console.error('Error in example action handler:', error)
    }
  })

  // Можно добавить другие обработчики action
}
