// В файле src/core/supabase/directPayment.ts

import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import {
  PaymentStatus,
  PaymentType,
  Currency,
  PaymentCreateParams,
  PaymentProcessResult,
} from '@/interfaces/payments.interface'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import { supabaseAdmin } from '@/core/supabase/'
import { getUserById } from '@/core/supabase/'
import { withUserBalanceLock } from './balanceLock'

// --- ИСПРАВЛЕННЫЙ ИНТЕРФЕЙС ВХОДНЫХ ПАРАМЕТРОВ ---
export interface DirectPaymentParams {
  /** Telegram ID пользователя */
  telegram_id: string
  /** Сумма операции (количество звезд) */
  amount: number
  /** Тип транзакции (списание или начисление) */
  type: string
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
  /** Опционально: Тип подписки для активации */
  subscription_type?: string
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
 *                 Используемые типы: `MONEY_INCOME`, `MONEY_OUTCOME`, `SYSTEM`, `BONUS`, etc.
 *              3. Инвалидирует кэш баланса пользователя.
 *              4. Возвращает результат операции, включая ID созданной записи.
 *              **НЕ вызывает** `createSuccessfulPayment` (т.к. та для вебхуков).
 *              **НЕ вызывает** `updateUserBalance` (т.к. баланс считается динамически).
 *
 * @param {DirectPaymentParams} params - Параметры операции (см. интерфейс DirectPaymentParams).
 * @param {string} params.telegram_id - Telegram ID пользователя
 * @param {number} params.amount - Сумма операции (количество звезд)
 * @param {PaymentType} params.type - Тип транзакции (из `PaymentType` enum, напр. `MONEY_OUTCOME`)
 * @param {string} params.description - Описание операции
 * @param {string} params.bot_name - Имя бота
 * @param {ModeEnum | string} params.service_type - Тип сервиса/режим
 * @param {string} [params.inv_id] - Опциональный ID операции/инвойса
 * @param {boolean} [params.bypass_payment_check=false] - Пропустить проверку баланса
 * @param {Record<string, any>} [params.metadata={}] - Дополнительные метаданные
 * @returns {Promise<DirectPaymentResult>} Результат операции.
 */
// Serialized per user by withUserBalanceLock below (same lock as
// updateUserBalance, so a user's two spend paths cannot race each other). The
// body is unchanged — it read-checks-inserts non-atomically (#999). Do NOT call
// this directly; use directPaymentProcessor.
async function directPaymentProcessorUnlocked(
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
    subscription_type, // Добавляем поддержку subscription_type
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
      type === PaymentType.MONEY_OUTCOME &&
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
    } else if (type === PaymentType.MONEY_OUTCOME && bypass_payment_check) {
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
      is_system_payment: metadata?.is_system_payment || false,
      category: metadata?.category || 'REAL',
      subscription_type: subscription_type || null, // Добавляем subscription_type
      metadata: {
        ...metadata,
        direct_payment: true,
        balance_before: currentBalance,
      },
      currency: Currency.XTR,
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
      '✅ [DIRECT_PAYMENT v2.0] Прямая обработка платежа завершена успешно',
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

/**
 * @deprecated Используйте updateUserBalance или функции модуля ProcessServiceBalance
 * Прямое внесение платежей
 */
/**
 * Public entry: serialize this user's balance write against every other, then
 * run the unchanged implementation. Interim double-spend guard, single-process
 * only — see balanceLock.ts and #999. This is the neuro-photo / HTTP-route path
 * (finding 2 in the money audit).
 */
export function directPaymentProcessor(
  params: DirectPaymentParams
): Promise<DirectPaymentResult> {
  return withUserBalanceLock(String(params.telegram_id), () =>
    directPaymentProcessorUnlocked(params)
  )
}

export async function directPayment(
  params: PaymentCreateParams
): Promise<PaymentProcessResult> {
  const {
    telegram_id,
    amount,
    stars,
    type,
    description,
    metadata,
    bot_name,
    service_type,
    subscription,
  } = params

  // 1. Проверка существования пользователя
  const user = await getUserById(telegram_id)
  if (!user) {
    return { success: false, message: 'User not found' }
  }

  // 2. Формирование данных для вставки
  const paymentData: Omit<PaymentCreateParams, 'telegram_id'> & {
    user_id: string
    status: PaymentStatus
  } = {
    user_id: user.id, // Используем UUID пользователя
    amount,
    stars: stars ?? 0,
    type: type as PaymentType, // Use the correct enum type
    description,
    metadata,
    bot_name,
    service_type: service_type ?? null,
    payment_method: params.payment_method || 'System', // Прямые платежи считаем системными
    status: PaymentStatus.COMPLETED, // Прямые платежи сразу завершены
    subscription: subscription ?? null, // Добавляем тип подписки
    currency: Currency.RUB, // Default to RUB or determine dynamically
    inv_id: params.inv_id,
  }

  // 3. Вставка платежа в базу данных
  try {
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .insert([paymentData])
      .select()

    if (error) {
      console.error('Error inserting direct payment:', error)
      return {
        success: false,
        message: 'Error inserting payment',
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        message: 'Failed to insert payment, no data returned',
      }
    }

    // 4. Логирование транзакции (опционально, если logTransaction существует)
    // await logTransaction({
    //   telegram_id,
    //   amount,
    //   type,
    //   description,
    //   status: PaymentStatus.COMPLETED,
    //   metadata: { ...metadata, direct_payment: true },
    //   service_type,
    //   bot_name,
    //   payment_id: data[0].id.toString(),
    //   subscription: subscription
    // })

    return { success: true, message: 'Payment successful', payment: data[0] }
  } catch (error) {
    console.error('Unexpected error during direct payment:', error)
    return {
      success: false,
      message: 'Unexpected system error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Обновляет баланс пользователя и записывает транзакцию в payments_v2.
 * @param telegram_id ID пользователя в Telegram.
 * @param amount Сумма изменения баланса (может быть отрицательной для списания).
 * @param type Тип транзакции (MONEY_INCOME, MONEY_EXPENSE, STARS_EXPENSE и т.д.).
 * @param description Описание транзакции.
 * @param metadata Дополнительные данные (например, ID инвойса).
 * @param bypass_payment_check Флаг для обхода проверки статуса платежа.
 * @returns true в случае успеха, false в случае ошибки.
 */
export async function updateUserBalance(
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description: string,
  metadata: Record<string, any> = {},
  bypass_payment_check = false
): Promise<boolean> {
  console.log(
    `updateUserBalance called: telegram_id=${telegram_id}, amount=${amount}, type=${type}`
  )
  const user = await getUserById(telegram_id)
  if (!user) {
    console.error(`User not found for telegram_id: ${telegram_id}`)
    return false
  }

  const isExpense = type === PaymentType.MONEY_OUTCOME // Original check
  let newBalance = 0

  try {
    const currentBalance = await getUserBalance(telegram_id)
    if (currentBalance === null) {
      console.error(`Failed to get current balance for user ${telegram_id}`)
      return false
    }

    newBalance = currentBalance + amount

    // Original balance check logic (before STARS_EXPENSE was incorrectly introduced)
    if (isExpense && newBalance < 0 && !bypass_payment_check) {
      console.log(
        `Insufficient balance for user ${telegram_id}: current=${currentBalance}, amount=${amount}`
      )
      // Недостаточно средств
      return false
    } else if (type === PaymentType.MONEY_OUTCOME && bypass_payment_check) {
      // Corrected: Was PaymentType.MONEY_OUTCOME
      console.log(`Bypassing balance check for user ${telegram_id}`)
      // Принудительное списание, даже если баланс уходит в минус
    }

    // Запись транзакции (Original logic)
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .insert([
        {
          user_id: user.id,
          telegram_id: telegram_id,
          amount: Math.abs(amount),
          stars: 0, // Assuming stars are handled separately or implicitly
          type: type,
          status: PaymentStatus.COMPLETED,
          description: description,
          metadata: metadata,
          bot_name: metadata.bot_name || 'unknown',
          payment_method: metadata.payment_method || 'System',
          inv_id: metadata.inv_id,
          service_type: metadata.service_type || null,
          subscription_type: metadata.subscription_type || null,
          currency: 'RUB', // Assuming default currency
        },
      ])
      .select()

    if (error) {
      console.error('Error inserting payment record:', error)
      return false
    }

    if (!data || data.length === 0) {
      console.error('Failed to insert payment record, no data returned.')
      return false
    }

    console.log(
      `Balance updated for user ${telegram_id}. New balance: ${newBalance}`
    )
    return true
  } catch (error) {
    console.error('Error updating balance:', error)
    return false
  }
}
