import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { sendTransactionNotification } from '@/helpers/sendTransactionNotification'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { v4 as uuidv4 } from 'uuid'
import {
  TransactionType,
  TRANSACTION_DESCRIPTIONS,
  DETAILED_TRANSACTION_DESCRIPTIONS,
  SERVICE_KEYS,
} from '@/interfaces/payments.interface'
import { TelegramId } from '@/interfaces/telegram.interface'

// Кэш для отслеживания обработанных платежей
const processedPayments = new Map<string, { time: number }>()

interface PaymentProcessorEvent {
  data: {
    telegram_id: TelegramId
    amount: number
    type: TransactionType
    description: string
    bot_name: string
    metadata?: Record<string, unknown>
    operation_id?: string
    inv_id?: string
    service_type?: string
  }
}

// Функция для получения детального описания транзакции
function getDetailedDescription(
  type: TransactionType,
  service?: string
): string {
  if (!service) {
    return TRANSACTION_DESCRIPTIONS[type]
  }

  const serviceDescriptions = DETAILED_TRANSACTION_DESCRIPTIONS[type]
  return serviceDescriptions[service] || serviceDescriptions.default
}

// Функция для определения сервиса из описания
function getServiceFromDescription(description: string): string {
  const serviceKeys = Object.values(SERVICE_KEYS)
  for (const service of serviceKeys) {
    if (description.toLowerCase().includes(service.toLowerCase())) {
      return service
    }
  }
  return 'default'
}

/**
 * Функция Inngest для обработки платежей с шагами
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: `payment-processor`,
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event }) => {
    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      inv_id,
      service_type,
    } = event.data

    logger.info('🚀 Обработка платежа:', {
      description: 'Processing payment',
      telegram_id,
      amount,
      type,
      service_type,
      bot_name,
      inv_id,
    })

    try {
      // Получаем текущий баланс до транзакции
      const currentBalance = await getUserBalance(telegram_id, bot_name)

      logger.info('💰 Текущий баланс пользователя:', {
        description: 'Current user balance',
        telegram_id,
        currentBalance,
        bot_name,
      })

      // Создаем запись о платеже
      const { data: payment, error: paymentError } = await supabase
        .from('payments_v2')
        .upsert([
          {
            inv_id: inv_id || `${telegram_id}-${Date.now()}`,
            telegram_id,
            amount,
            stars: amount,
            type,
            description,
            bot_name,
            status: 'COMPLETED',
            payment_method: 'balance',
            currency: 'STARS',
            metadata: service_type ? { service_type } : undefined,
          },
        ])
        .select('*')
        .single()

      if (paymentError) {
        logger.error('❌ Ошибка при создании записи о платеже:', {
          description: 'Error creating payment record',
          error: paymentError.message,
          error_details: paymentError,
          telegram_id,
          type,
          bot_name,
        })
        throw new Error('Payment creation failed')
      }

      logger.info('✅ Запись о платеже создана:', {
        description: 'Payment record created successfully',
        payment_id: payment?.payment_id,
        telegram_id,
        amount,
        type,
        bot_name,
      })

      // Проверяем, существует ли пользователь в базе данных
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('balance, id')
        .eq('telegram_id', telegram_id)
        .single()

      if (userError) {
        logger.error('❌ Ошибка при проверке пользователя:', {
          description: 'Error checking user existence',
          error: userError.message,
          error_details: userError,
          telegram_id,
          bot_name,
        })
        throw new Error('User check failed')
      }

      if (!user) {
        logger.error('❌ Пользователь не найден:', {
          description: 'User not found in database',
          telegram_id,
          bot_name,
        })
        throw new Error('User not found')
      }

      // Обновляем баланс пользователя через add_stars_to_balance
      const updateBalanceParams = {
        telegram_id,
        amount,
        type: type as 'money_income' | 'money_expense',
        operation_description: description,
        bot_name,
        payment_method: 'balance',
        metadata: { payment_id: payment?.payment_id },
        service_type: service_type || 'default',
      }

      logger.info('🔄 Параметры обновления баланса:', {
        description: 'Balance update parameters',
        ...updateBalanceParams,
      })

      const {
        success,
        newBalance,
        error: balanceError,
      } = await updateUserBalance(updateBalanceParams)

      if (!success || balanceError) {
        logger.error('❌ Ошибка при обновлении баланса:', {
          description: 'Error updating balance',
          error: balanceError,
          telegram_id,
          type,
          bot_name,
          user_id: user.id,
          current_db_balance: user.balance,
          attempted_amount_change: amount,
        })

        // Проверяем, если у пользователя недостаточно средств
        if (type === 'money_expense' && user.balance < Math.abs(amount)) {
          logger.error('💸 Недостаточно средств на балансе:', {
            description: 'Insufficient funds',
            telegram_id,
            current_balance: user.balance,
            required_amount: Math.abs(amount),
            bot_name,
          })
          throw new Error('Insufficient funds')
        }

        throw new Error('Balance update failed')
      }

      // Отправляем уведомление
      const operationId = uuidv4()
      await sendTransactionNotification({
        telegram_id: Number(telegram_id),
        operationId,
        amount,
        currentBalance: Number(currentBalance) || 0,
        newBalance: Number(newBalance) || 0,
        description: description || 'Платеж успешно обработан',
        isRu: true,
        bot_name,
      })

      logger.info('✅ Платеж успешно обработан:', {
        description: 'Payment processed successfully',
        payment_id: payment?.payment_id,
        telegram_id,
        amount,
        type,
        currentBalance,
        newBalance,
        bot_name,
      })

      return payment
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : 'Unknown error',
        error_stack: error instanceof Error ? error.stack : undefined,
        telegram_id,
        amount,
        type,
        bot_name,
      })
      throw error
    }
  }
)
