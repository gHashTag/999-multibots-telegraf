import { Telegraf, type Context } from 'telegraf'

/**
 * Минимальный пример регистрации простого middleware.
 */
export function registerExampleMiddleware(bot: Telegraf<Context>) {
  // Регистрируем middleware, которое будет выполняться для всех update
  bot.use(async (ctx, next) => {
    console.log('Running example middleware...')
    // Устанавливаем флаг в state контекста
    ctx.state.middlewareRan = true
    // Вызываем следующую middleware или обработчик в цепочке
    await next()
    console.log('Finished example middleware.')
  })

  // Можно добавить обработчик после middleware, чтобы проверить вызов next()
  // bot.on('message', (ctx) => {
  //   console.log('Handler executed after middleware');
  //   ctx.reply('Handler after middleware');
  // });
}
