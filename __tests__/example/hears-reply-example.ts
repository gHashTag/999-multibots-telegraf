import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации обработчика hears, который отвечает простым текстом.
 */
export function registerExampleHears(bot: Telegraf<Context>) {
  bot.hears('hello', async ctx => {
    try {
      console.log('Received "hello", replying with "world"...')
      await ctx.reply('world')
    } catch (error) {
      console.error('Error in example hears handler:', error)
      // В реальном коде здесь был бы вызов ctx.reply об ошибке или логгера
    }
  })

  // Можно добавить другие обработчики для демонстрации, если нужно
  // bot.hears('bye', async (ctx) => { await ctx.reply('Goodbye!') });
}
