import { MyContext } from '@/interfaces'
import { BOT_TOKEN, BOT_TOKEN_2 } from '@/config'

export function getSubScribeChannel(ctx: MyContext): string {
  const botToken = ctx.telegram.token

  switch (botToken) {
    case BOT_TOKEN:
      return 'neuro_blogger_group'
    case BOT_TOKEN_2:
      return 'neuro_nataly_group'
    default:
      return 'neuro_blogger_group'
  }
}
