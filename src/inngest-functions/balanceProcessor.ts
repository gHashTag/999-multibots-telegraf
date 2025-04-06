import { inngest } from '@/core/inngest/clients'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

/**
 * Функция Inngest для обработки операций с балансом
 */
export const balanceProcessor = inngest.createFunction(
  {
    id: `balance-processor`,
    retries: 3,
  },
  { event: 'balance/process' },
  async ({ event, step }) => {
    try {
      const {
        telegram_id,
        amount,
        type,
        description,
        bot_name,
        operation_id,
        metadata = {},
      } = event.data

      // ШАГ 1: Получение текущего баланса
      const currentBalance = await step.run('get-current-balance', async () => {
        logger.info('💰 ШАГ 1: Получение текущего баланса', {
          description: 'Step 1: Getting current balance',
          telegram_id,
          bot_name,
        })

        const balance = await getUserBalance(telegram_id, bot_name)

        if (balance === null || balance === undefined || isNaN(Number(balance))) {
          logger.error('❌ Ошибка получения баланса:', {
            description: 'Error getting balance',
            telegram_id,
            balance,
          })
          throw new Error('Invalid balance')
        }

        logger.info('✅ Баланс получен успешно:', {
          description: 'Balance retrieved successfully',
          telegram_id,
          balance,
        })

        return balance
      })

      // ШАГ 2: Проверка достаточности средств для списания
      await step.run('check-balance', async () => {
        if (type === 'balance_decrease' && currentBalance < Math.abs(amount)) {
          logger.error('❌ Недостаточно средств:', {
            description: 'Insufficient funds',
            telegram_id,
            required: Math.abs(amount),
            available: currentBalance,
          })
          throw new Error('Insufficient funds')
        }
      })

      // ШАГ 3: Обновление баланса
      const newBalance = await step.run('update-balance', async () => {
        logger.info('💳 ШАГ 3: Обновление баланса', {
          description: 'Step 3: Updating balance',
          telegram_id,
          amount,
          type,
        })

        const updatedBalance = await updateUserBalance({
          telegram_id,
          amount,
          type,
          operation_description: description,
          metadata,
          bot_name,
          payment_method: 'balance',
        })

        if (updatedBalance === null || updatedBalance === undefined || isNaN(Number(updatedBalance))) {
          logger.error('❌ Ошибка обновления баланса:', {
            description: 'Error updating balance',
            telegram_id,
            amount,
          })
          throw new Error('Balance update failed')
        }

        logger.info('✅ Баланс успешно обновлен:', {
          description: 'Balance updated successfully',
          telegram_id,
          old_balance: currentBalance,
          new_balance: updatedBalance,
          amount,
        })

        return updatedBalance
      })

      // Отправляем событие об успешном обновлении баланса
      await inngest.send({
        id: `balance-update-success-${operation_id || uuidv4()}`,
        name: 'balance/updated',
        data: {
          telegram_id,
          amount,
          type,
          description,
          bot_name,
          operation_id,
          metadata: {
            ...metadata,
            old_balance: currentBalance,
            new_balance: newBalance,
          },
        },
      })

      return {
        success: true,
        old_balance: currentBalance,
        new_balance: newBalance,
      }
    } catch (error) {
      logger.error('❌ Ошибка в обработке баланса:', {
        description: 'Error in balance processing',
        error: error instanceof Error ? error.message : 'Unknown error',
        event_data: event.data,
      })

      // Отправляем событие о неудачном обновлении баланса
      await inngest.send({
        id: `balance-update-failed-${event.data.operation_id || uuidv4()}`,
        name: 'balance/update.failed',
        data: {
          ...event.data,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })

      throw error
    }
  }
) 