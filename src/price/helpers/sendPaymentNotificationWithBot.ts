import { pulseBot } from '@/core/bot'
import { logger } from '@/utils/logger'


export interface Payments {
  telegram_id: string
  username: string
  amount: string
  stars: number
}

export async function sendPaymentNotificationWithBot({
  telegram_id,
  username,
  amount,
  stars,
}: Payments ) {
  const groupId = '@neuro_blogger_pulse'
  try {
    await pulseBot.telegram.sendMessage(
      groupId,
      `💸 Пользователь @${username} (Telegram ID: ${telegram_id}) оплатил ${amount} рублей и получил ${stars} звезд.`
    )

    return true
  } catch (error: any) {
    logger.error('❌ Ошибка при отправке уведомления об оплате:', {
      description: 'Error sending payment notification',
      error: error?.message || error,
      response: error?.response,
      groupId,
    })
    throw new Error('Ошибка при отправке уведомления об оплате')
  }
}
