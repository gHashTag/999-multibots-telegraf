import { MyContext } from '@/interfaces'
import { BOT_TOKEN, BOT_TOKEN_2 } from '@/config'

export function getPhotoUrl(ctx: MyContext, step: number): string {
  const botToken = ctx.telegram.token

  switch (botToken) {
    case BOT_TOKEN:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_sage/levels/${step}.jpg`
    case BOT_TOKEN_2:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/muse_nataly/levels/${step}.jpg`
    default:
      return `https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_sage/levels/${step}.jpg`
  }
}
