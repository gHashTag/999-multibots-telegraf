import { Telegraf, type Context } from 'telegraf'
import { session } from 'telegraf' // Импортируем middleware сессии

// Расширяем интерфейс Context, чтобы включить session
// Важно: Тип session может быть более сложным в реальном приложении
interface SessionContext extends Context {
  session?: {
    counter?: number
  }
}

/**
 * Минимальный пример использования ctx.session для счетчика.
 * Команда /count увеличивает счетчик в сессии.
 */
export function registerSessionExample(bot: Telegraf<SessionContext>) {
  // Инициализируем сессию (in-memory для простоты примера)
  // В реальном приложении может использоваться хранилище (Redis, DB)
  bot.use(session())

  // Обработчик команды /count
  bot.command('count', async ctx => {
    // Инициализируем счетчик, если его нет
    ctx.session ??= {}
    ctx.session.counter = (ctx.session.counter || 0) + 1

    const message = `Counter: ${ctx.session.counter}`
    console.log(message) // Для отладки в тесте
    await ctx.reply(message)
  })
}
