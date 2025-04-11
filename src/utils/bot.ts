import { Telegraf } from 'telegraf'

const bots: { [key: string]: Telegraf } = {}

export function getBotByName(name: string): Telegraf | null {
  return bots[name] || null
}

export function registerBot(name: string, bot: Telegraf): void {
  bots[name] = bot
}
