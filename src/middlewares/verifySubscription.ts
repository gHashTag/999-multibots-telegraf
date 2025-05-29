import { MyContext } from '@/interfaces'
import { checkSubscription, kickUnpaidUser } from './checkSubscription'
import { handleSubscriptionMessage } from './handleSubscriptionMessage'
import { logger } from '@/utils/logger'

export async function verifySubscription(
  ctx: MyContext,
  language_code: string,
  telegram_channel_id: string
): Promise<boolean> {
  const isSubscribed = await checkSubscription(ctx, telegram_channel_id)

  if (!isSubscribed) {
    await handleSubscriptionMessage(ctx, language_code, telegram_channel_id)

    const telegramId = ctx.from?.id?.toString() || 'unknown'
    logger.info('🚫 User not subscribed, attempting to kick from group', {
      telegramId,
      telegram_channel_id,
      language_code,
    })

    const kickReason =
      language_code === 'ru'
        ? 'Отсутствие подписки на канал'
        : 'No channel subscription'

    await kickUnpaidUser(ctx, telegram_channel_id, kickReason)

    return isSubscribed
  }
  return isSubscribed
}
