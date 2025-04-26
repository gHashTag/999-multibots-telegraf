import type { MyContext } from '@/interfaces'

export const sendPaymentNotification = async (
  ctx: MyContext,
  amount: number,
  stars: number,
  telegramId: string,
  language: string,
  username: string
) => {
  try {
    const caption =
      language === 'ru'
        ? `💸 Пользователь @${
            username || 'Пользователь без username'
          } (Telegram ID: ${telegramId}) оплатил ${amount} рублей и получил ${stars} звезд.`
        : `💸 User @${
            username || 'User without username'
          } (Telegram ID: ${telegramId}) paid ${amount} RUB and received ${stars} stars.`

    await ctx.telegram.sendMessage('-4166575919', caption)
  } catch (error) {
    console.error('Ошибка при отправке уведомления об оплате:', error)
    throw new Error('Ошибка при отправке уведомления об оплате')
  }
}
