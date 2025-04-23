// В файле src/core/supabase/directPayment.ts

import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { TransactionType, PaymentStatus } from '@/interfaces/payments.interface'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'

// --- ИСПРАВЛЕННЫЙ ИНТЕРФЕЙС ВХОДНЫХ ПАРАМЕТРОВ ---
export interface DirectPaymentParams {
  /** Telegram ID пользователя */
  telegram_id: string
  /** Сумма операции (количество звезд) */
  amount: number
  /** Тип транзакции (списание или начисление) */
  type: TransactionType
  /** Описание операции (отображается пользователю) */
  description: string
  /** Имя бота, в котором происходит операция */
  bot_name: string
  /** Тип сервиса/режим, за который операция (например, 'neuro_photo') */
  service_type: ModeEnum | string
  /** Опциональный внешний ID операции/инвойса */
  inv_id?: string
  /** Опционально: Пропустить проверку баланса перед списанием (true/false) */
  bypass_payment_check?: boolean
  /** Опционально: Дополнительные метаданные для записи в БД */
  metadata?: Record<string, any>
}

// --- ИСПРАВЛЕННЫЙ ИНТЕРФЕЙС РЕЗУЛЬТАТА ---
export interface DirectPaymentResult {
  /** Флаг успешности операции */
  success: boolean
  /** ID созданной записи в таблице payments_v2 (если успех) */
  payment_id?: number
  /** ID операции (переданный или сгенерированный) */
  operation_id: string
  /** Информация об изменении баланса (если успех) */
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
  /** Сообщение об ошибке (если неуспех) */
  error?: string // Добавлено поле для ошибки
}

/**
 * @function directPaymentProcessor (v2.0)
 * @description **Основная функция для прямого списания или начисления звезд с баланса пользователя.**
 *              Используется для внутренних операций, НЕ связанных с внешними платежными системами.
 *              Работает по принципу "расчет по транзакциям":
 *              1. Проверяет текущий баланс (если это списание).
 *              2. **Создает новую запись** о транзакции (доход/расход) в таблице `payments_v2`.
 *              3. Инвалидирует кэш баланса пользователя.
 *              4. Возвращает результат операции, включая ID созданной записи.
 *              **НЕ вызывает** `createSuccessfulPayment` (т.к. та для вебхуков).
 *              **НЕ вызывает** `updateUserBalance` (т.к. баланс считается динамически).
 *
 * @param {DirectPaymentParams} params - Параметры операции (см. интерфейс DirectPaymentParams).
 * @returns {Promise<DirectPaymentResult>} Результат операции (см. интерфейс DirectPaymentResult).
 */
export async function directPaymentProcessor(
  params: DirectPaymentParams
): Promise<DirectPaymentResult> {
  const {
    telegram_id,
    amount,
    type,
    description,
    bot_name, // Доступно благодаря исправлению интерфейса
    service_type, // Доступно благодаря исправлению интерфейса
    inv_id, // Доступно благодаря исправлению интерфейса
    bypass_payment_check = false, // Доступно благодаря исправлению интерфейса
    metadata = {}, // Доступно благодаря исправлению интерфейса
  } = params

  const operationId = inv_id || `direct-${uuidv4()}`
  const normalizedAmount = Number(amount)

  // Добавляем логгер v2.0 для ясности
  logger.info('🚀 [DIRECT_PAYMENT v2.0] Начало прямой обработки платежа', {
    /* ... */
  })

  try {
    // 1. Проверка валидности суммы
    if (normalizedAmount <= 0) {
      throw new Error(
        `Некорректная сумма: ${normalizedAmount}. Сумма должна быть > 0.`
      )
    }

    // 2. Получение текущего баланса
    const currentBalance = await getUserBalance(telegram_id)
    logger.info('💰 [DIRECT_PAYMENT v2.0] Текущий баланс получен', {
      telegram_id,
      currentBalance,
    })

    // 3. Проверка баланса для списания
    if (
      type === TransactionType.MONEY_EXPENSE &&
      !bypass_payment_check &&
      currentBalance < normalizedAmount
    ) {
      const errorMsg = `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${normalizedAmount}`
      logger.error('⚠️ [DIRECT_PAYMENT v2.0] Недостаточно средств', {
        telegram_id,
        currentBalance,
        requiredAmount: normalizedAmount,
      })
      // Возвращаем ошибку согласно исправленному интерфейсу DirectPaymentResult
      return { success: false, error: errorMsg, operation_id: operationId }
    } else if (type === TransactionType.MONEY_EXPENSE && bypass_payment_check) {
      logger.warn(
        '🔓 [DIRECT_PAYMENT v2.0] Проверка баланса пропущена (bypass)',
        { telegram_id }
      )
    }

    // 4. ПРЯМАЯ ВСТАВКА ЗАПИСИ В payments_v2
    logger.info('💳 [DIRECT_PAYMENT v2.0] Попытка прямой вставки записи', {
      /* ... */
    })

    const paymentInsertData = {
      telegram_id: String(telegram_id),
      amount: normalizedAmount,
      stars: normalizedAmount,
      payment_method: 'balance',
      description: description,
      type: type,
      service_type: String(service_type),
      bot_name: bot_name,
      status: PaymentStatus.COMPLETED,
      inv_id: operationId,
      metadata: {
        ...metadata,
        direct_payment: true,
        balance_before: currentBalance,
      },
      currency: 'XTR',
    }
    // logger.info('➡️ [DIRECT_PAYMENT v2.0] Данные для вставки:', { insertData: paymentInsertData });

    const { data: insertedPayment, error: insertError } = await supabase
      .from('payments_v2')
      .insert([paymentInsertData])
      .select('id')
      .single()

    if (insertError) {
      logger.error('❌ [DIRECT_PAYMENT v2.0] Ошибка DB при вставке записи', {
        /* ... */
      })
      throw new Error(
        `Ошибка базы данных при записи платежа: ${insertError.message}`
      )
    }

    // Исправленная проверка ID
    if (!insertedPayment?.id || typeof insertedPayment.id !== 'number') {
      logger.error(
        '❌ [DIRECT_PAYMENT v2.0] Запись вставлена, но не удалось получить ID!',
        {
          /* ... */
        }
      )
      throw new Error(
        'Не удалось получить ID созданной записи о платеже после вставки.'
      )
    }

    const newPaymentId = insertedPayment.id
    logger.info('✅ [DIRECT_PAYMENT v2.0] Запись о платеже успешно вставлена', {
      payment_id: newPaymentId,
      telegram_id,
    })

    // 5. Инвалидация кэша баланса
    logger.info('🔄 [DIRECT_PAYMENT v2.0] Инвалидация кэша баланса', {
      telegram_id,
    })
    await invalidateBalanceCache(String(telegram_id))

    // 6. Получение нового баланса
    const newBalance = await getUserBalance(telegram_id)
    logger.info('💰 [DIRECT_PAYMENT v2.0] Новый баланс получен', {
      telegram_id,
      newBalance,
    })

    // 7. Отправка уведомления пользователю
    try {
      // Создаем объект параметров БЕЗ 'type', если он не нужен в SendTransactionNotificationParams
      const notificationParams = {
        telegram_id: Number(telegram_id),
        operationId: operationId,
        amount: normalizedAmount,
        currentBalance: currentBalance,
        newBalance: newBalance,
        description: description,
        isRu: metadata?.is_ru ?? true,
        bot_name: bot_name,
      }
      await sendTransactionNotificationTest(notificationParams)
      logger.info(
        '✉️ [DIRECT_PAYMENT v2.0] Уведомление о транзакции отправлено',
        {
          /* ... */
        }
      )
    } catch (notifyError) {
      logger.error('❌ [DIRECT_PAYMENT v2.0] Ошибка при отправке уведомления', {
        /* ... */
      })
    }

    logger.info(
      '🏁 [DIRECT_PAYMENT v2.0] Прямая обработка платежа завершена успешно',
      {
        /* ... */
      }
    )

    // Возвращаем успешный результат
    return {
      success: true,
      payment_id: newPaymentId,
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
    logger.error('❌ [DIRECT_PAYMENT v2.0] Критическая ошибка', {
      /* ... */
    })
    // Возвращаем ошибку согласно исправленному интерфейсу DirectPaymentResult
    return { success: false, error: errorMessage, operation_id: operationId }
  }
}
