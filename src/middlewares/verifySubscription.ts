import { MyContext } from '@/interfaces'
import { checkSubscription } from './checkSubscription'
import { handleSubscriptionMessage } from './handleSubscriptionMessage'

export async function verifySubscription(
  ctx: MyContext,
  language_code: string,
  telegram_channel_id: string
): Promise<boolean> {
  const isSubscribed = await checkSubscription(ctx, telegram_channel_id)

  if (!isSubscribed) {
    await handleSubscriptionMessage(ctx, language_code, telegram_channel_id)
    return isSubscribed
  }
  return isSubscribed
}
