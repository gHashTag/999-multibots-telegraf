import type { BotName } from '@/interfaces/telegram-bot.interface'
import { Context } from 'telegraf'

const validBotNames = [
  'neuro_blogger_bot',
  'MetaMuse_Manifest_bot',
  'ZavaraBot',
  'LeeSolarbot',
  'NeuroLenaAssistant_bot',
  'NeurostylistShtogrina_bot',
  'Gaia_Kamskaia_bot',
  'ai_koshey_bot',
  'clip_maker_neuro_bot',
] as const

export function toBotName(name: string): BotName {
  if (validBotNames.includes(name as BotName)) {
    return name as BotName
  }
  throw new Error(`Invalid bot name: ${name}`)
}
