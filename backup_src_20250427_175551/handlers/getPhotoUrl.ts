import type { MyContext } from '@/interfaces'
import { BOT_TOKENS } from '@/core/bot'

export function getPhotoUrl(ctx: MyContext, step: number): string {
  const botToken = ctx.telegram.token

  switch (botToken) {
    case BOT_TOKENS[0]:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/levels/${step}.jpg`
    case BOT_TOKENS[1]:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/MetaMuse_Manifest_bot/levels/${step}.jpg`
    case BOT_TOKENS[2]:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/ZavaraBot/levels/${step}.jpg`
    default:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/levels/${step}.jpg`
  }
}
