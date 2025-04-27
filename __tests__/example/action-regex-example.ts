import { Telegraf, type Context } from 'telegraf'

// Расширяем контекст для хранения match
interface ContextWithMatch extends Context {
  match?: RegExpExecArray
}

// Экспортируем сам коллбэк
export const exampleRegexActionCallback = async (ctx: ContextWithMatch) => {
  try {
    // ctx.match содержит результат выполнения regex
    const itemId = ctx.match?.[1] // Получаем захваченную группу (ID)
    console.log(`Received action matching regex, item ID: ${itemId}`)

    // Отвечаем на callback query
    await ctx.answerCbQuery()

    if (itemId) {
      await ctx.reply(`Selected item ID: ${itemId}`)
    } else {
      await ctx.reply('Could not extract item ID.')
    }
  } catch (error) {
    console.error('Error in example regex action handler:', error)
    try {
      await ctx.answerCbQuery('Error processing action')
    } catch {}
  }
}

/**
 * Минимальный пример регистрации обработчика action с использованием regex.
 */
export function registerExampleActionRegex(bot: Telegraf<ContextWithMatch>) {
  // Регистрируем обработчик с regex для захвата ID
  bot.action(/^item:(\d+)$/, exampleRegexActionCallback) // Используем экспортированный коллбэк
}
