import { Payment } from '@/interfaces/payments.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { createBotByName, BOT_NAMES } from '../bot'
import type { BotName } from '@/interfaces'

export const sendPaymentInfo = async (invId: string): Promise<boolean> => {
  try {
    const { data: paymentData, error: paymentError } = await supabase
      // .from('payments') // Старая таблица
      .from('payments_v2') // Новая таблица
      .select('*')
      .eq('inv_id', invId)
      .single()

    if (paymentError || !paymentData) {
      logger.error('❌ Ошибка при получении информации о платеже:', {
        description: 'Error fetching payment info by invId',
        invId,
        error: paymentError?.message,
      })
      return false
    }

    logger.info('✅ Информация о платеже получена:', {
      description: 'Payment info fetched successfully',
      invId,
      paymentData,
    })

    const { bot_name, amount, telegram_id, currency } = paymentData
    const botData = await createBotByName(bot_name as BotName)

    if (!botData) {
      logger.error(
        '❌ Не удалось создать экземпляр бота для отправки уведомления:',
        {
          description: 'Failed to create bot instance for notification',
          bot_name,
          invId,
        }
      )
      return false // Ошибка создания бота критична здесь?
    }

    const { bot, groupId } = botData
    const username = paymentData.username || 'unknown_user' // Добавим username из paymentData если есть
    const stars = paymentData.stars || 0 // Добавим stars

    const message = `💸 Новый платеж!
Пользователь: @${username} (ID: ${telegram_id})
Сумма: ${amount} ${currency}
Звезд начислено: ${stars}
InvId: ${invId}
Бот: ${bot_name}`

    if (!groupId) {
      logger.error('❌ Группа не найдена:', {
        description: 'Group not found',
        invId,
      })
      return false
    }

    await bot.telegram.sendMessage(groupId, message)
    logger.info('✅ Уведомление об оплате отправлено в группу:', {
      description: 'Payment notification sent to group',
      groupId,
      invId,
    })

    return true
  } catch (error) {
    logger.error('❌ Неожиданная ошибка в sendPaymentInfo:', {
      description: 'Unexpected error in sendPaymentInfo',
      invId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return false
  }
}
