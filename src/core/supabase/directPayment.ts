import { v4 as uuidv4 } from 'uuid'

import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { TransactionType } from '@/interfaces/payments.interface'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'

export interface DirectPaymentParams {
  telegram_id: string
  amount: number
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum | string
  inv_id?: string // Optional invoice/operation ID
  bypass_payment_check?: boolean // Optional flag to bypass balance check
  metadata?: Record<string, any> // Optional metadata
}

export interface DirectPaymentResult {
  success: boolean
  payment_id?: number
  operation_id?: string
  error?: string
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
}

/**
 * Прямой обработчик платежей без использования Inngest.
 * Используется как резервный вариант или для тестов.
 */
export async function directPaymentProcessor(
  params: DirectPaymentParams
): Promise<DirectPaymentResult> {
  const {
    telegram_id,
    amount,
    type,
    description,
    bot_name,
    service_type,
    inv_id,
    bypass_payment_check = false,
    metadata = {},
  } = params

  const operationId = inv_id || uuidv4()
  const normalizedAmount = Number(amount)

  logger.info('🚀 [DIRECT_PAYMENT] Начало прямой обработки платежа', {
    description: 'Starting direct payment processing',
    telegram_id,
    amount: normalizedAmount,
    type,
    bot_name,
    service_type,
    operationId,
    bypass_payment_check,
  })

  try {
    // 1. Проверка валидности суммы
    if (normalizedAmount <= 0) {
      throw new Error(
        `Некорректная сумма платежа: ${normalizedAmount}. Сумма должна быть положительной.`
      )
    }

    // 2. Получение текущего баланса
    const currentBalance = await getUserBalance(telegram_id)
    logger.info('💰 [DIRECT_PAYMENT] Текущий баланс получен', {
      description: 'Current balance retrieved',
      telegram_id,
      currentBalance,
    })

    // 3. Проверка баланса для списания (если не обходим проверку)
    if (
      type === TransactionType.MONEY_EXPENSE &&
      !bypass_payment_check &&
      currentBalance < normalizedAmount
    ) {
      const errorMessage = `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${normalizedAmount}`
      logger.error('⚠️ [DIRECT_PAYMENT] Недостаточно средств', {
        description: 'Insufficient funds',
        telegram_id,
        currentBalance,
        requiredAmount: normalizedAmount,
      })
      // Можно добавить создание записи о неудачной попытке, если нужно
      return {
        success: false,
        error: errorMessage,
        operation_id: operationId,
      }
    } else if (type === TransactionType.MONEY_EXPENSE && bypass_payment_check) {
      logger.warn(
        '🔓 [DIRECT_PAYMENT] Проверка баланса пропущена (режим bypass)',
        {
          description: 'Balance check skipped (bypass mode)',
          telegram_id,
          currentBalance,
          requiredAmount: normalizedAmount,
        }
      )
    }

    // 4. Создание записи о платеже (ИСПОЛЬЗУЕМ createSuccessfulPayment)
    logger.info(
      '💳 [DIRECT_PAYMENT] Вызов createSuccessfulPayment для записи о платеже',
      {
        description: 'Calling createSuccessfulPayment to record payment',
        telegram_id,
        amount: normalizedAmount,
        type,
        operationId,
      }
    )

    const paymentRecord = await createSuccessfulPayment({
      telegram_id: String(telegram_id),
      amount: normalizedAmount,
      stars: metadata.stars || normalizedAmount,
      type: type,
      description: description,
      bot_name: bot_name,
      service_type: String(service_type),
      payment_method: 'balance',
      status: 'COMPLETED',
      inv_id: operationId,
      metadata: { ...metadata, direct_payment: true },
    })

    // Восстанавливаем проверку на ID
    if (!paymentRecord || !paymentRecord.payment_id) {
      // Используем payment_id
      throw new Error('Не удалось создать запись о платеже или получить ее ID')
    }

    logger.info('✅ [DIRECT_PAYMENT] Запись о платеже успешно создана', {
      description: 'Payment record created successfully',
      payment_id: paymentRecord.payment_id, // Используем payment_id
      telegram_id,
    })

    // 5. Инвалидация кэша баланса
    logger.info('🔄 [DIRECT_PAYMENT] Инвалидация кэша баланса', {
      description: 'Invalidating balance cache',
      telegram_id,
    })
    await invalidateBalanceCache(String(telegram_id))

    // 6. Получение нового баланса (после инвалидации кэша)
    const newBalance = await getUserBalance(telegram_id)
    logger.info('💰 [DIRECT_PAYMENT] Новый баланс получен', {
      description: 'New balance retrieved',
      telegram_id,
      newBalance,
    })

    // 7. Отправка уведомления пользователю
    sendTransactionNotificationTest({
      telegram_id: Number(telegram_id),
      operationId: operationId,
      amount: normalizedAmount,
      currentBalance: currentBalance,
      newBalance: newBalance,
      description: description,
      isRu: metadata?.is_ru ?? true,
      bot_name: bot_name,
    }).catch(err => {
      logger.error(
        '❌ [DIRECT_PAYMENT] Ошибка при отправке уведомления о транзакции',
        {
          description: 'Error sending transaction notification',
          error: err instanceof Error ? err.message : String(err),
          telegram_id,
          operationId,
        }
      )
    })

    logger.info(
      '🏁 [DIRECT_PAYMENT] Прямая обработка платежа завершена успешно',
      {
        description: 'Direct payment processing completed successfully',
        telegram_id,
        payment_id: paymentRecord.payment_id, // Используем payment_id
        operationId,
        newBalance,
      }
    )

    // Возвращаем результат с payment_id
    return {
      success: true,
      payment_id: paymentRecord.payment_id, // Используем payment_id
      operation_id: operationId,
      balanceChange: {
        before: currentBalance,
        after: newBalance,
        difference: newBalance - currentBalance,
      },
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown direct payment error'
    logger.error(
      '❌ [DIRECT_PAYMENT] Критическая ошибка при прямой обработке платежа',
      {
        description: 'Critical error during direct payment processing',
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        telegram_id,
        operationId,
        params,
      }
    )
    return {
      success: false,
      error: errorMessage,
      operation_id: operationId,
    }
  }
}
