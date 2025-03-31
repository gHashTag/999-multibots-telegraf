import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function sendPaymentNotificationWithBot({
  bot,
  groupId,
  telegram_id,
  username,
  amount,
  stars,
}: {
  bot: Telegraf<MyContext>
  groupId: string
  telegram_id: string
  username: string
  amount: string
  stars: number
}) {
  try {
    // Проверяем, что у бота есть метод sendMessage
    if (!bot.telegram?.sendMessage) {
      logger.error(
        '❌ Telegram клиент не инициализирован или отсутствует метод sendMessage:',
        {
          description:
            'Telegram client not initialized or missing sendMessage method',
          hasTelegram: !!bot.telegram,
          methods: bot.telegram ? Object.keys(bot.telegram) : [],
        }
      )
      throw new Error('Telegram client not properly initialized')
    }

    // Отправляем уведомление в группу
    // Добавляем @ к groupId, если его нет
    const formattedGroupId = groupId.startsWith('@') ? groupId : `@${groupId}`

    await bot.telegram.sendMessage(
      formattedGroupId,
      `💸 Пользователь @${username} (Telegram ID: ${telegram_id}) оплатил ${amount} рублей и получил ${stars} звезд.`
    )

    logger.info('✅ Уведомление отправлено в группу:', {
      description: 'Group notification sent',
      groupId: formattedGroupId,
    })

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
