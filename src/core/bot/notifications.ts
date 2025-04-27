import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export const sendPaymentNotification = async ({
  amount,
  stars,
  telegramId,
  language_code,
  username,
  groupId,
  bot,
}: {
  amount: string
  stars: number
  telegramId: string
  language_code: string
  username: string
  groupId: string
  bot: Telegraf<MyContext>
}) => {
  try {
    const caption =
      language_code === 'ru'
        ? `💸 Пользователь @${
            username || 'Пользователь без username'
          } (Telegram ID: ${telegramId.toString()}) оплатил ${amount} рублей и получил ${stars} звезд.`
        : `💸 User @${
            username || 'User without username'
          } (Telegram ID: ${telegramId.toString()}) paid ${amount} RUB and received ${stars} stars.`

    await bot.telegram.sendMessage(groupId, caption)
    logger.info('✅ Уведомление об оплате отправлено в группу', {
      groupId,
      username,
      telegramId,
      amount,
      stars,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления об оплате:', {
      error,
      groupId,
      telegramId,
    })
  }
}
