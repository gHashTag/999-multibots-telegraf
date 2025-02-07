import { MyContext } from '@/interfaces'
import { BOT_TOKENS } from '@/core/bot'

export function getSubScribeChannel(ctx: MyContext): string {
  const botToken = ctx.telegram.token

  switch (botToken) {
    case BOT_TOKENS[0]:
      return 'neuro_blogger_group'
    case BOT_TOKENS[1]:
      return 'MetaMuse_AI_Influencer'
    default:
      return 'neuro_blogger_group'
  }
}
