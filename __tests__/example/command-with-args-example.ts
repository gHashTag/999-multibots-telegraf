import { Telegraf, type Context } from 'telegraf'
import type { Message } from '@telegraf/types'

/**
 * Минимальный пример регистрации команды, которая обрабатывает аргументы.
 */
export function registerExampleCommandWithArgs(bot: Telegraf<Context>) {
  bot.command('args', async ctx => {
    try {
      // Получаем текст сообщения
      const text = (ctx.message as Message.TextMessage)?.text || ''
      // Разбиваем текст на слова и убираем саму команду (/args)
      const parts = text.split(' ').slice(1)

      if (parts.length > 0) {
        const argsString = parts.join(', ')
        console.log(`Received /args command with args: ${argsString}`)
        await ctx.reply(`Args received: ${argsString}`)
      } else {
        console.log('Received /args command with no args.')
        await ctx.reply('No args provided.')
      }
    } catch (error) {
      console.error('Error in example args handler:', error)
    }
  })
}
