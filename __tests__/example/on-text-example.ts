import { Telegraf, type Context } from 'telegraf'
import { message } from 'telegraf/filters' // Импортируем фильтр

/**
 * Минимальный пример регистрации универсального обработчика текстовых сообщений.
 */
export function registerExampleOnText(bot: Telegraf<Context>) {
  // Используем message('text') для обработки любых текстовых сообщений
  // bot.on('text', async (ctx) => { // Альтернативный способ
  bot.on(message('text'), async ctx => {
    try {
      console.log('Received some text, replying...')
      // Просто отвечаем, что текст получен
      await ctx.reply('Text received')
    } catch (error) {
      console.error('Error in example on(text) handler:', error)
    }
  })
}
