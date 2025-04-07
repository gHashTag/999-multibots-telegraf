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

export interface PaymentProcessEvent {
  telegram_id: TelegramId
  amount: number
  type: TransactionType
  description: string
  bot_name?: string
  is_ru?: boolean
  service_type?: string
  operation_id?: string
  metadata?: Record<string, any>
}

/**
 * Централизованный процессор платежей через Inngest
 * Выполняет все операции с балансом пользователя
 */
export const paymentProcessor = inngest.createFunction(
  {
    id: 'payment-processor',
    name: 'Payment Processor',
    retries: 3,
  },
  { event: 'payment/process' },
  async ({ event, step }) => {
    try {
      const {
        telegram_id,
        amount,
        type = 'money_income',
        description = '',
        bot_name = 'default_bot',
        service_type = 'default',
        operation_id = '',
        metadata = {},
      } = event.data as PaymentProcessEvent

      logger.info('🚀 Обработка платежа:', {
        description: 'Processing payment',
        telegram_id,
        amount,
        type,
        service_type,
        bot_name,
        inv_id: operation_id,
      })

      // Проверяем существует ли пользователь
      const userExists = await step.run('check-user-exists', async () => {
        const user = await getUserByTelegramId(telegram_id, bot_name)
        if (!user) {
          logger.info('👤 Пользователь не найден, будет создан:', {
            description: 'User not found, will be created',
            telegram_id,
            bot_name,
          })
        } else {
          logger.info('👤 Найден пользователь:', {
            description: 'User found',
            telegram_id,
            user_id: user.id,
            current_balance: user.balance,
            bot_name,
          })
        }
        return !!user
      })

      // Получаем текущий баланс пользователя
      const currentBalance = await step.run('get-user-balance', async () => {
        const balance = await getUserBalance(telegram_id, bot_name)

        logger.info('💰 Текущий баланс пользователя:', {
          description: 'Current user balance',
          telegram_id,
          currentBalance: balance,
          bot_name,
        })

        return balance
      })

      // Проверка достаточности средств при списании
      if (type === 'money_expense' && currentBalance < Math.abs(amount)) {
        logger.error('❌ Недостаточно средств для списания:', {
          description: 'Insufficient funds for deduction',
          telegram_id,
          currentBalance,
          requestedAmount: amount,
          bot_name,
        })

        throw new Error('Insufficient funds')
      }

      // Создаем запись о платеже
      const paymentRecord = await step.run(
        'create-payment-record',
        async () => {
          try {
            if (operation_id) {
              // Проверяем, не обработан ли уже этот платеж
              const existingPayment = await getPaymentByInvId(operation_id)
              if (existingPayment) {
                logger.info('⚠️ Платеж уже обработан:', {
                  description: 'Payment already processed',
                  payment_id: existingPayment.payment_id,
                  inv_id: operation_id,
                })
                return existingPayment
              }
            }

            const payment = await createSuccessfulPayment({
              telegram_id,
              amount,
              stars: amount,
              payment_method: 'balance',
              description,
              type,
              bot_name,
              status: 'COMPLETED',
              metadata: {
                ...metadata,
                service_type,
                operation_id,
              },
            })

            logger.info('✅ Запись о платеже создана:', {
              description: 'Payment record created successfully',
              payment_id: payment.payment_id,
              telegram_id,
              amount,
              type,
              bot_name,
            })

            return payment
          } catch (error) {
            logger.error('❌ Ошибка при создании записи о платеже:', {
              description: 'Error creating payment record',
              error: error instanceof Error ? error.message : String(error),
              error_details: error,
              telegram_id,
              amount,
              type,
              bot_name,
            })
            throw error
          }
        }
      )

      // Обновляем баланс пользователя через специальную RPC функцию
      const balanceUpdate = await step.run('update-user-balance', async () => {
        try {
          logger.info('🔄 Параметры обновления баланса:', {
            description: 'Balance update parameters',
            telegram_id,
            amount,
            type,
            operation_description: description,
            bot_name,
            payment_method: 'balance',
            metadata: { payment_id: paymentRecord.payment_id },
            service_type,
          })

          // Используем новую функцию с проверкой баланса
          const updateResult = await updateUserBalance({
            telegram_id,
            amount:
              type === 'money_expense' ? -Math.abs(amount) : Math.abs(amount),
            type,
            description: description || 'Balance update',
            bot_name,
            service_type,
            metadata: {
              ...metadata,
              payment_id: paymentRecord.payment_id,
            },
          })

          if (!updateResult.success) {
            throw updateResult.error || new Error('Balance update failed')
          }

          return {
            success: true,
            oldBalance: currentBalance,
            newBalance: updateResult.balance,
          }
        } catch (error) {
          logger.error('❌ Ошибка при обновлении баланса:', {
            description: 'Error updating balance',
            error: error instanceof Error ? error.message : String(error),
            telegram_id,
            type,
            bot_name,
            user_id: userExists ? 'exists' : 'new',
            current_db_balance: currentBalance,
            attempted_amount_change: amount,
          })
          throw error
        }
      })

      // Формируем результат обработки платежа
      return {
        success: true,
        telegram_id,
        amount,
        type,
        payment_id: paymentRecord.payment_id,
        old_balance: balanceUpdate.oldBalance,
        new_balance: balanceUpdate.newBalance,
        operation_id,
        bot_name,
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        telegram_id: event.data.telegram_id,
        amount: event.data.amount,
        type: event.data.type,
        bot_name: event.data.bot_name,
      })
      throw error
    }
  }
)
