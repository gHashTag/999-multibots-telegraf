import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { v4 as uuidv4 } from 'uuid'
import { getUserBalance } from './getUserBalance'
import { TransactionType } from '@/interfaces/payments.interface'

interface UpdateUserBalanceParams {
  telegram_id: string
  amount: number
  type: TransactionType
  operation_description: string
  metadata?: Record<string, any>
  bot_name: string
  payment_method?: string
}

/**
 * Обновляет баланс пользователя через событие payment/process
 */
export const updateUserBalance = async ({
  telegram_id,
  amount,
  type,
  operation_description,
  metadata = {},
  bot_name,
  payment_method,
}: UpdateUserBalanceParams): Promise<number | null> => {
  try {
    logger.info('💰 Отправка события обновления баланса:', {
      description: 'Sending balance update event',
      telegram_id,
      amount,
      type,
      operation_description,
    })

    const operation_id = `${telegram_id}-${Date.now()}-${uuidv4()}`

    // Отправляем событие для обновления баланса
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id,
        amount,
        type,
        description: operation_description,
        bot_name,
        operation_id,
        metadata: {
          ...metadata,
          payment_method,
        },
      },
    })

    // Даем время на обработку события
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Получаем обновленный баланс
    const newBalance = await getUserBalance(telegram_id, bot_name)

    if (!newBalance) {
      logger.error('❌ Не удалось получить обновленный баланс:', {
        description: 'Failed to get updated balance',
        telegram_id,
      })
      return null
    }

    logger.info('✅ Баланс успешно обновлен:', {
      description: 'Balance updated successfully',
      telegram_id,
      new_balance: newBalance,
    })

    return newBalance
  } catch (error) {
    logger.error('❌ Ошибка при обновлении баланса:', {
      description: 'Error updating balance',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
      amount,
    })
    return null
  }
}
