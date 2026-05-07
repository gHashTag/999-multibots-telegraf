import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { BotName } from '@/interfaces/telegram-bot.interface'
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

interface SendTransactionNotificationParams {
  telegram_id: number
  operationId: string
  amount: number
  currentBalance: number
  newBalance: number
  description: string
  isRu?: boolean
  bot_name?: string
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
      currentBalance,
      newBalance,
    })

    // ✅ ИСПРАВЛЕНО: Используем getBotByName вместо createBotByName
    // Боты уже зарегистрированы в объекте bots, не нужно создавать новый экземпляр
    const botData = getBotByName(bot_name)

    if (!botData.bot || botData.error) {
      throw new Error(
        `Bot ${bot_name} not found: ${botData.error || 'unknown error'}`
      )
    }

    // Преобразуем баланс к числу для корректных вычислений
    const oldBalanceNumber = Number(currentBalance)
    const newBalanceNumber = Number(newBalance)

    // Проверяем направление операции
    // Если amount отрицательный, но новый баланс выше старого, значит есть ошибка отображения
    if (amount < 0 && newBalanceNumber > oldBalanceNumber) {
      logger.warn('⚠️ Подозрительное изменение баланса:', {
        description: 'Suspicious balance change',
        amount,
        currentBalance: oldBalanceNumber,
        newBalance: newBalanceNumber,
        expected_new_balance: oldBalanceNumber + amount,
      })
    }

    const message = isRu
      ? `
ID: ${operationId}
Сумма: ${amount} ⭐️
Старый баланс: ${oldBalanceNumber} ⭐️
Новый баланс: ${newBalanceNumber} ⭐️`
      : `
ID: ${operationId}
Amount: ${amount} ⭐️
Old balance: ${oldBalanceNumber} ⭐️
New balance: ${newBalanceNumber} ⭐️`

    await botData.bot.telegram.sendMessage(telegram_id, message)

    logger.info('✅ Уведомление отправлено:', {
      description: 'Transaction notification sent',
      telegram_id,
      operationId,
      amount,
      old_balance: oldBalanceNumber,
      new_balance: newBalanceNumber,
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

export async function sendTransactionNotificationTest(
  params: SendTransactionNotificationParams
): Promise<{ success: boolean }> {
  // В тестовом окружении просто логируем и возвращаем успех
  if (process.env.NODE_ENV === 'test') {
    logger.info('📨 Мок уведомления о транзакции:', {
      description: 'Mock transaction notification',
      telegram_id: params.telegram_id,
      operationId: params.operationId,
      amount: params.amount,
      currentBalance: params.currentBalance,
      newBalance: params.newBalance,
    })
    return { success: true }
  }

  // Реальная реализация для продакшена
  try {
    const {
      telegram_id,
      operationId,
      amount,
      currentBalance,
      newBalance,
      description,
      isRu = true,
      bot_name = 'default',
    } = params

    logger.info('📨 Начало отправки уведомления о транзакции:', {
      description: 'Starting to send transaction notification',
      telegram_id,
      operationId,
      amount,
      currentBalance,
      newBalance,
      bot_name,
    })

    await sendTransactionNotification({
      telegram_id,
      operationId,
      amount,
      currentBalance,
      newBalance,
      description,
      isRu,
      bot_name,
    })

    logger.info('✅ Уведомление о транзакции успешно отправлено:', {
      description: 'Transaction notification successfully sent',
      telegram_id,
      operationId,
      amount,
    })

    return { success: true }
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления о транзакции:', {
      description: 'Error sending transaction notification',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: params.telegram_id,
      operationId: params.operationId,
      amount: params.amount,
    })
    return { success: false }
  }
}
