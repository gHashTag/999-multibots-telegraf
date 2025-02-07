import { MyContext } from '@/interfaces'
import { BOT_TOKENS } from '@/core/bot'

export function getBotToken(ctx: MyContext): string {
  const botToken = ctx.telegram.token

  switch (botToken) {
    case BOT_TOKENS[0]:
      return BOT_TOKENS[0]
    case BOT_TOKENS[1]:
      return BOT_TOKENS[1]
    default:
      return BOT_TOKENS[0]
  }
}
