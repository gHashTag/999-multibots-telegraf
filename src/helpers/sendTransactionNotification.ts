import { Telegram } from 'telegraf'
import { logger } from '@/utils/logger'

interface TransactionNotificationParams {
  telegram_id: number
  operationId: string
  amount: number
  currentBalance: number
  newBalance: number
  description: string
  isRu: boolean
  bot: Telegram
}

export const sendTransactionNotification = async ({
  telegram_id,
  operationId,
  amount,
  currentBalance,
  newBalance,
  description,
  isRu,
  bot
}: TransactionNotificationParams) => {
  try {
    logger.info('📝 Отправка уведомления о транзакции:', {
      description: 'Sending transaction notification',
      telegram_id,
      operationId,
      amount,
    })

    const message = isRu
      ? `${description}
ID: ${operationId}
Сумма: ${amount} ⭐️
Старый баланс: ${currentBalance} ⭐️
Новый баланс: ${newBalance} ⭐️`
      : `${description}
ID: ${operationId}
Amount: ${amount} ⭐️
Old balance: ${currentBalance} ⭐️
New balance: ${newBalance} ⭐️`

    await bot.sendMessage(telegram_id, message)

    logger.info('✅ Уведомление отправлено:', {
      description: 'Transaction notification sent',
      telegram_id,
      operationId,
    })
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления:', {
      description: 'Error sending transaction notification',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      operationId,
    })
    throw error
  }
} 