import { TelegramId } from '@/interfaces/telegram.interface'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { createSuccessfulPayment } from './createSuccessfulPayment'
import { getUserBalance, invalidateBalanceCache } from './getUserBalance'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import { normalizeTransactionType } from '@/interfaces/payments.interface'
import { notifyAmbassadorAboutPayment } from '@/services/ambassadorPaymentNotifier'

interface DirectPaymentParams {
  telegram_id: TelegramId
  amount: number
  type: TransactionType | string
  description: string
  bot_name: string
  service_type?: ModeEnum
  stars?: number
  metadata?: Record<string, any>
  inv_id?: string
  bypass_payment_check?: boolean
}

interface DirectPaymentResult {
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
 * Прямой процессор платежей (резервный)
 * Используется, когда Inngest недоступен
 *
 * Выполняет все те же операции, что и Inngest-функция paymentProcessor,
 * но напрямую, без использования Inngest
 *
 * @param params Параметры платежа
 * @returns Результат выполнения платежа
 */
export async function directPaymentProcessor(
  params: DirectPaymentParams
): Promise<DirectPaymentResult> {
  try {
    // Клонируем параметры для безопасной модификации
    const validatedParams = { ...params }

    // Нормализуем тип транзакции в нижний регистр
    if (validatedParams.type) {
      validatedParams.type = normalizeTransactionType(
        validatedParams.type as TransactionType
      )
    }

    if (!validatedParams.telegram_id || !validatedParams.amount) {
      throw new Error(
        '🚫 Не переданы обязательные параметры: telegram_id или amount'
      )
    }

    const {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type,
      stars,
      metadata,
      inv_id,
      bypass_payment_check,
    } = validatedParams

    // Генерируем операционный ID, если не задан
    const operationId = inv_id || uuidv4()

    logger.info('🚀 [DIRECT] Начало прямой обработки платежа', {
      description: 'Starting direct payment processing (Inngest fallback)',
      telegram_id,
      amount,
      type,
      bot_name,
      service_type,
    })

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
    logger.info('💰 [DIRECT] Получение текущего баланса', {
      description: 'Getting current balance (direct)',
      telegram_id,
    })
    const currentBalance = await getUserBalance(telegram_id)

    // Проверяем баланс для списания
    if (type === TransactionType.MONEY_EXPENSE && !bypass_payment_check) {
      logger.info('💰 [DIRECT] Проверка баланса для списания', {
        description: 'Checking balance for expense (direct)',
        telegram_id,
        currentBalance,
        amount,
      })

      if (currentBalance < amount) {
        const errorMessage = `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${amount}`
        logger.error('❌ [DIRECT] ' + errorMessage, {
          description: 'Insufficient funds (direct)',
          telegram_id,
          currentBalance,
          amount,
        })
        return {
          success: false,
          error: errorMessage,
          telegram_id: telegram_id.toString(),
          amount,
          type: type.toString(),
        }
      }
    } else if (bypass_payment_check && type === TransactionType.MONEY_EXPENSE) {
      logger.info('🔄 [DIRECT] Пропуск проверки баланса (тестовый режим)', {
        description: 'Bypassing balance check (test mode)',
        telegram_id,
        currentBalance,
        amount,
      })
    }

    // Создаем запись о платеже
    logger.info('💳 [DIRECT] Создание записи о платеже', {
      description: 'Creating payment record (direct)',
      telegram_id,
      amount,
      type,
    })

    try {
      const payment = await createSuccessfulPayment({
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
        metadata,
      })

      // Инвалидируем кэш баланса
      logger.info('🔄 [DIRECT] Инвалидация кэша баланса:', {
        description: 'Invalidating balance cache (direct)',
        telegram_id,
      })
      invalidateBalanceCache(telegram_id)

      // Получаем обновленный баланс
      const newBalance = await getUserBalance(telegram_id)

      // Отправляем уведомление пользователю
      try {
        logger.info('📨 [DIRECT] Отправка уведомления пользователю', {
          description: 'Sending notification to user (direct)',
          telegram_id,
          amount,
          paymentId: payment.id,
        })

        await sendTransactionNotificationTest({
          telegram_id: Number(telegram_id),
          operationId: payment.operation_id || operationId,
          amount: payment.amount,
          currentBalance,
          newBalance,
          description: payment.description,
          isRu: true,
          bot_name: payment.bot_name,
        })
      } catch (notificationError) {
        // Логируем ошибку, но не прерываем обработку
        logger.error('⚠️ [DIRECT] Ошибка при отправке уведомления', {
          description: 'Error sending notification (direct payment continues)',
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
          telegram_id,
        })
      }

      // Отправляем уведомление амбассадору, если платеж совершен в его боте
      try {
        if (payment.bot_name) {
          const hasAmbassador = await notifyAmbassadorAboutPayment(payment)

          if (hasAmbassador) {
            logger.info('✅ [DIRECT] Уведомление для амбассадора отправлено', {
              description: 'Ambassador notification sent successfully (direct)',
              paymentId: payment.id,
              botName: payment.bot_name,
            })
          }
        }
      } catch (ambassadorError) {
        // Логируем ошибку, но не прерываем обработку платежа
        logger.error(
          '❌ [DIRECT] Ошибка при отправке уведомления амбассадору',
          {
            description: 'Error sending notification to ambassador (direct)',
            error:
              ambassadorError instanceof Error
                ? ambassadorError.message
                : String(ambassadorError),
            paymentId: payment.id,
            botName: payment.bot_name || 'unknown',
          }
        )
      }

      logger.info('✅ [DIRECT] Платеж успешно обработан', {
        description: 'Payment processed successfully (direct)',
        telegram_id,
        amount,
        type,
        paymentId: payment.id,
      })

      return {
        success: true,
        payment: {
          payment_id: payment.id,
          telegram_id: telegram_id.toString(),
          amount,
          stars: stars || amount,
          type: type.toString(),
          status: 'COMPLETED',
        },
        balanceChange: {
          before: currentBalance,
          after: newBalance,
          difference: newBalance - currentBalance,
        },
        operation_id: operationId,
      }
    } catch (paymentError) {
      logger.error('❌ [DIRECT] Ошибка при создании платежа', {
        description: 'Error creating payment (direct)',
        error:
          paymentError instanceof Error
            ? paymentError.message
            : String(paymentError),
        telegram_id,
        amount,
        type,
      })

      return {
        success: false,
        error:
          paymentError instanceof Error
            ? paymentError.message
            : 'Ошибка при создании платежа',
        telegram_id: telegram_id.toString(),
        amount,
        type: type.toString(),
      }
    }
  } catch (error) {
    logger.error('❌ [DIRECT] Критическая ошибка в directPaymentProcessor', {
      description: 'Critical error in directPaymentProcessor',
      error: error instanceof Error ? error.message : String(error),
      params,
    })

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Критическая ошибка при обработке платежа',
      telegram_id: params.telegram_id?.toString(),
      amount: params.amount,
      type: params.type?.toString(),
    }
  }
}
