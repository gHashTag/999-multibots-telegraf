import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'

/**
 * Функция Inngest для обработки операций с балансом в базе данных
 */
export const balanceDbProcessor = inngest.createFunction(
  {
    id: `balance-db-processor`,
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

        const { data: userData, error } = await supabase
          .from('users')
          .select('balance')
          .eq('telegram_id', telegram_id)
          .single()

        if (error) {
          logger.error('❌ Ошибка при получении баланса:', {
            description: 'Error getting balance',
            error: error.message,
            telegram_id,
          })
          throw error
        }

        if (!userData) {
          logger.error('❌ Пользователь не найден:', {
            description: 'User not found',
            telegram_id,
          })
          throw new Error('User not found')
        }

        logger.info('✅ Баланс получен успешно:', {
          description: 'Balance retrieved successfully',
          telegram_id,
          balance: userData.balance,
        })

        return userData.balance
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

      // ШАГ 3: Обновление баланса в базе данных
      const newBalance = await step.run('update-balance', async () => {
        logger.info('💳 ШАГ 3: Обновление баланса в базе данных', {
          description: 'Step 3: Updating balance in database',
          telegram_id,
          amount,
          type,
        })

        const { data: result, error } = await supabase.rpc('update_user_balance', {
          p_telegram_id: telegram_id,
          p_amount: amount,
        })

        if (error) {
          logger.error('❌ Ошибка при обновлении баланса:', {
            description: 'Error updating balance',
            error: error.message,
            telegram_id,
            amount,
          })
          throw error
        }

        logger.info('✅ Баланс успешно обновлен:', {
          description: 'Balance updated successfully',
          telegram_id,
          old_balance: currentBalance,
          new_balance: result,
          amount,
        })

        return result
      })

      // Отправляем событие об успешном обновлении баланса
      await inngest.send({
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