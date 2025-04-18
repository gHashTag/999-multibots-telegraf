import { Telegraf } from 'telegraf'
import { MyContext } from './interfaces'
import { botLogger } from './utils/logger'

export async function setBotCommands(bot: Telegraf<MyContext>) {
  try {
    const botName = bot.botInfo?.username || 'unknown'
    botLogger.info(botName, `Установка команд для бота ${botName}`)

    // Используем await вместо eslint-disable-next-line @typescript-eslint/no-floating-promises
    await bot.telegram.setMyCommands([
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

    botLogger.info(botName, `Команды успешно установлены для бота ${botName}`)
    return true
  } catch (error) {
    const botName = bot.botInfo?.username || 'unknown'
    const errorMessage = error instanceof Error ? error.message : String(error)
    botLogger.error(
      botName,
      `Ошибка при установке команд бота: ${errorMessage}`
    )
    // Продолжаем работу бота даже при ошибке установки команд
    return false
  }
}
