import { BotName } from '@/interfaces/telegram-bot.interface'
import { BOT_NAMES } from '@/core/bot'

export function toBotName(name: string): BotName {
  if (Object.keys(BOT_NAMES).includes(name)) {
    return name as BotName
  }
  throw new Error(`Invalid bot name: ${name}`)
}
