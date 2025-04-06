import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'

interface TransactionNotificationParams {
  telegram_id: number
  operationId: string
  amount: number
  currentBalance: number
  newBalance: number
  description: string
  isRu: boolean
  bot_name: string
}

export const sendTransactionNotification = async ({
  telegram_id,
  operationId,
  amount,
  currentBalance,
  newBalance,
  isRu,
  bot_name,
}: TransactionNotificationParams) => {
  try {
    logger.info('📝 Отправка уведомления о транзакции:', {
      description: 'Sending transaction notification',
      telegram_id,
      operationId,
      amount,
    })

    const botData = await createBotByName(bot_name)

    if (!botData) {
      throw new Error(`Bot ${bot_name} not found`)
    }

    const message = isRu
      ? `
ID: ${operationId}
Сумма: ${amount} ⭐️
Старый баланс: ${currentBalance} ⭐️
Новый баланс: ${newBalance} ⭐️`
      : `
ID: ${operationId}
Amount: ${amount} ⭐️
Old balance: ${currentBalance} ⭐️
New balance: ${newBalance} ⭐️`

    await botData.bot.telegram.sendMessage(telegram_id, message)

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
