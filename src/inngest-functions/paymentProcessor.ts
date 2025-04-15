import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'

import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { v4 as uuidv4 } from 'uuid'
import {
  PaymentProcessParams,
  TransactionType,
} from '@/interfaces/payments.interface'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { normalizeTransactionType } from '@/interfaces/payments.interface'

import { notifyAmbassadorAboutPayment } from '@/services/ambassadorPaymentNotifier'

/**
 * Интерфейс события обработки платежа
 */
export interface PaymentProcessEvent {
  name: 'payment/process'
  data: PaymentProcessParams
}

/**
 * Результат обработки платежа
 */
export interface PaymentProcessResult {
  success: boolean
  payment?: {
    payment_id: number
    telegram_id: string
    amount: number
    stars: number
    type: string
    status: string
  }
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
  operation_id?: string
  error?: string
  telegram_id?: string
  amount?: number
  type?: string
}

/**
 * Отправляет уведомление пользователю о платеже
 *
 * @param payment Данные платежа
 * @param currentBalance Текущий баланс до операции
 * @param newBalance Новый баланс после операции
 */
async function sendPaymentNotification(
  payment: any,
  currentBalance: number,
  newBalance: number
): Promise<void> {
  logger.info('📨 Отправка уведомления пользователю', {
    description: 'Sending notification to user',
    telegram_id: payment.telegram_id,
    amount: payment.amount,
    paymentId: payment.id,
  })

  await sendTransactionNotificationTest({
    telegram_id: Number(payment.telegram_id),
    operationId: payment.operation_id || uuidv4(),
    amount: payment.amount,
    currentBalance,
    newBalance,
    description: payment.description,
    isRu: true,
    bot_name: payment.bot_name,
  })
}

/**
 * Обработка ошибок Robokassa
 * @param errorCode Код ошибки
 * @returns Описание ошибки
 */
function handleRobokassaError(errorCode: string): string {
  const errorMessages: Record<string, string> = {
    '31': 'Неверная сумма платежа',
    '33': 'Время отведённое на оплату счёта истекло',
    '40': 'Повторная оплата счета с тем же номером невозможна',
    '41': 'Ошибка на старте операции',
    '51': 'Срок оплаты счета истек',
    '52': 'Попытка повторной оплаты счета',
    '53': 'Счет не найден',
  }

  return errorMessages[errorCode] || 'Неизвестная ошибка'
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
    const validatedParams = event.data as PaymentProcessParams

    // Нормализуем тип транзакции в нижний регистр
    if (validatedParams.type) {
      validatedParams.type = normalizeTransactionType(
        validatedParams.type as TransactionType
      )
    }

    if (!validatedParams) {
      throw new Error('🚫 Не переданы параметры')
    }

    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      stars,
    } = validatedParams

    // Генерируем операционный ID, если не задан
    const operationId = validatedParams.inv_id || uuidv4()

    logger.info('🚀 Начало обработки платежа', {
      description: 'Starting payment processing',
      telegram_id,
      amount,
      type,
      bot_name,
      service_type,
    })

    try {
      // Проверяем, что amount положительное
      if (amount <= 0) {
        throw new Error(
          `Некорректная сумма платежа: ${amount}. Сумма должна быть положительной.`
        )
      }

      // Проверяем, что stars положительное, если указано
      if (stars !== undefined && stars <= 0) {
        throw new Error(
          `Некорректное количество звезд: ${stars}. Количество должно быть положительным.`
        )
      }

      // Получаем текущий баланс
      const currentBalance = await step.run('get-balance', async () => {
        logger.info('💰 Получение текущего баланса', {
          description: 'Getting current balance',
          telegram_id,
        })
        return getUserBalance(telegram_id)
      })

      // Проверяем баланс для списания
      if (type === TransactionType.MONEY_EXPENSE) {
        logger.info('💰 Проверка баланса для списания', {
          description: 'Checking balance for expense',
          telegram_id,
          currentBalance,
          amount,
        })

        if (currentBalance < amount) {
          throw new Error(
            `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
          )
        }
      }

      // Проверяем ошибку от Robokassa
      if (validatedParams.error_code) {
        const errorMessage = handleRobokassaError(validatedParams.error_code)
        logger.error('❌ Ошибка Robokassa:', {
          description: 'Robokassa error',
          error_code: validatedParams.error_code,
          error_message: errorMessage,
          inv_id: validatedParams.inv_id,
        })

        // Обновляем статус платежа в случае ошибки
        if (validatedParams.inv_id) {
          await supabase
            .from('payments_v2')
            .update({
              status: 'FAILED',
              metadata: {
                ...validatedParams.metadata,
                error_code: validatedParams.error_code,
                error_message: errorMessage,
              },
            })
            .eq('inv_id', validatedParams.inv_id)
        }

        throw new Error(errorMessage)
      }

      // Создаем запись о платеже
      const payment = await step.run('create-payment', async () => {
        logger.info('💳 Создание записи о платеже', {
          description: 'Creating payment record',
          telegram_id,
          amount,
          type,
        })

        try {
          return await createSuccessfulPayment({
            telegram_id,
            amount,
            stars: stars || amount,
            type,
            description,
            bot_name,
            service_type,
            payment_method: 'balance',
            status: 'COMPLETED',
            inv_id: operationId,
            metadata: validatedParams.metadata,
          })
        } catch (error) {
          // Проверяем, является ли ошибка дубликатом платежа
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
          ) {
            logger.info(
              '🔄 Обнаружен дубликат платежа, получаем существующий платеж',
              {
                description:
                  'Duplicate payment detected, retrieving existing payment',
                telegram_id,
                inv_id: operationId,
              }
            )

            // Получаем существующий платеж
            const { data: existingPayment } = await supabase
              .from('payments_v2')
              .select('*')
              .eq('inv_id', operationId)
              .single()

            if (!existingPayment) {
              throw new Error('Не удалось найти существующий платеж')
            }

            logger.info('✅ Возвращаем существующий платеж', {
              description: 'Returning existing payment',
              payment_id: existingPayment.id,
              telegram_id,
              inv_id: operationId,
            })

            return existingPayment
          }
          throw error
        }
      })

      // Инвалидируем кэш баланса и получаем новый баланс
      const newBalance = await step.run('get-new-balance', async () => {
        // Сначала инвалидируем кэш баланса, чтобы получить свежие данные
        logger.info('🔄 Инвалидация кэша баланса:', {
          description: 'Invalidating balance cache',
          telegram_id,
        })
        invalidateBalanceCache(telegram_id)

        // Теперь получаем обновленный баланс
        return getUserBalance(telegram_id)
      })

      // Отправляем уведомление пользователю (только если не локальное окружение)

      await step.run('send-notification', async () => {
        await sendPaymentNotification(payment, currentBalance, newBalance)
      })

      // Отправляем уведомление амбассадору, если платеж совершен в его боте
      await step.run('send-ambassador-notification', async () => {
        try {
          if (payment.bot_name) {
            const hasAmbassador = await notifyAmbassadorAboutPayment(payment)

            if (hasAmbassador) {
              logger.info('✅ Уведомление для амбассадора отправлено', {
                description: 'Ambassador notification sent successfully',
                paymentId: payment.id,
                botName: payment.bot_name,
              })
            }
          }
        } catch (error: any) {
          // Логируем ошибку, но не прерываем обработку платежа
          logger.error('❌ Ошибка при отправке уведомления амбассадору', {
            description: 'Error sending notification to ambassador',
            error: error.message,
            stack: error.stack,
            paymentId: payment.id,
            botName: payment.bot_name || 'unknown',
          })
        }
      })

      return {
        success: true,
        payment: {
          payment_id: payment.id,
          telegram_id,
          amount,
          stars: stars || amount,
          type,
          status: 'COMPLETED',
        },
        balanceChange: {
          before: currentBalance,
          after: newBalance,
          difference: newBalance - currentBalance,
        },
        operation_id: operationId,
      }
    } catch (error) {
      logger.error('❌ Ошибка обработки платежа:', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
        telegram_id,
        amount,
        type,
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        telegram_id,
        amount,
        type,
      }
    }
  }
)
