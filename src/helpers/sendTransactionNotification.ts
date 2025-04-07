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
  description,
  isRu,
  bot_name,
}: TransactionNotificationParams): Promise<{ success: boolean }> => {
  try {
    logger.info('💰 Отправка уведомления о транзакции', {
      message: 'Sending transaction notification',
      telegram_id,
      operationId,
      amount,
      description,
    })

    if (!bot_name) {
      throw new Error('Bot name is required')
    }

    const botData = await createBotByName(bot_name)

    if (!botData) {
      throw new Error(`Bot ${bot_name} not found`)
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

    return { success: true }
  } catch (error) {
    logger.error('❌ Ошибка при отправке уведомления о транзакции', {
      message: 'Error sending transaction notification',
      telegram_id,
      operationId,
      amount,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function sendTransactionNotificationTest(
  params: SendTransactionNotificationParams
): Promise<{ success: boolean }> {
  const {
    telegram_id,
    operationId,
    amount,
    currentBalance,
    newBalance,
    description,
    isRu = false,
    bot_name,
  } = params

  // В тестовом окружении просто логируем и возвращаем успех
  if (process.env.NODE_ENV === 'test') {
    logger.info('📨 Мок уведомления о транзакции:', {
      description,
      telegram_id,
      operationId,
      amount,
      currentBalance,
      newBalance,
      isRu,
      bot_name,
    })
    return { success: true }
  }

  // Реальная реализация для продакшена
  try {
    logger.info('📝 Отправка уведомления о транзакции:', {
      description: 'Sending transaction notification',
      telegram_id,
      operationId,
      amount,
      currentBalance,
      newBalance,
    })

    if (!bot_name) {
      throw new Error('Bot name is required')
    }

    const botData = await createBotByName(bot_name)

    if (!botData) {
      throw new Error(`Bot ${bot_name} not found`)
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

    return { success: true }
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
