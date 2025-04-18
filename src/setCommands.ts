import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { botLogger } from './utils/logger'

export function setBotCommands(bot: Telegraf<MyContext>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    bot.telegram.setMyCommands([
      {
        command: 'start',
        description: '👤 Start / Начать',
      },
      {
        command: 'menu',
        description: '👤 Menu / Главное меню',
      },
      // {
      //   command: 'invite',
      //   description: '👥 Invite a friend / Пригласить друга',
      // },
      // {
      //   command: 'price',
      //   description: '⭐️ Price / Цена',
      // },
      // {
      //   command: 'buy',
      //   description: '💵 Top up balance / Пополнить баланс',
      // },
      // {
      //   command: 'balance',
      //   description: '💰 Balance / Баланс',
      // },
      // {
      //   command: 'help',
      //   description: '🤖 Help / Помощь',
      // },
    ])
  } catch (error) {
    const botName = bot.botInfo?.username || 'unknown'
    const errorMessage = error instanceof Error ? error.message : String(error)
    botLogger.error(
      botName,
      `Ошибка при установке команд бота: ${errorMessage}`
    )
    // Продолжаем работу бота даже при ошибке установки команд
  }
}
