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
} from '@/interfaces/payments.interface'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
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
      // warn, not error: logger.error is a push notification to the owner's
      // Telegram group, and there is nothing for an operator to do here.
      //
      // This is a PRE-WRITE guard. It fires before the only write in this
      // function (the payments_v2 insert below) and returns at the next line,
      // so nothing was inserted and nothing is half-done -- no reconciliation,
      // no stuck money. The balance it compares against came from a plain
      // getUserBalance above and was logged there, so an empty wallet here is
      // the customer's own state, not ours.
      //
      // This is the shared floor under every direct-charge spend path
      // (generateNeuroPhotoDirect, plan_b/generateImageToPrompt), so at error
      // it pages the owner once per person who cannot afford a generation.
      // warn rather than info keeps it in the log at the same level the rest
      // of the repository already uses for a refused charge -- see
      // src/__tests__/money/balanceRefusalIsToldApartFromAnOutage.test.ts.
      //
      // The caller is told regardless: `{ success: false, error: errorMsg }`.
      logger.warn('⚠️ [DIRECT_PAYMENT v2.0] Недостаточно средств', {
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

    // The payment row is committed above (newPaymentId exists) -> the operation
    // SUCCEEDED. Everything below is best-effort enrichment for the return value;
    // a throw here must NOT reach the outer catch and flip a committed payment to
    // success:false (the caller would retry into a double charge / not deliver).
    // #1397 class. invalidateBalanceCache is a no-op today but kept switchable.
    try {
      await invalidateBalanceCache(String(telegram_id))
    } catch (cacheError) {
      logger.error(
        '[DIRECT_PAYMENT v2.0] cache invalidation threw after a committed payment (non-fatal):',
        {
          telegram_id,
          error:
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError),
        }
      )
    }

    // Best-effort new-balance read for the return payload; on failure fall back
    // to the pre-op balance so a transient read cannot flip a committed payment.
    let newBalance = currentBalance
    try {
      newBalance = await getUserBalance(telegram_id)
    } catch (balanceError) {
      logger.error(
        '[DIRECT_PAYMENT v2.0] getUserBalance threw after a committed payment (non-fatal, using pre-op balance for display):',
        {
          telegram_id,
          error:
            balanceError instanceof Error
              ? balanceError.message
              : String(balanceError),
        }
      )
    }

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
      /*
       * THE THIRD COPY OF THE SAME EVENT, AND IT IS UNREACHABLE.
       *
       * `sendTransactionNotificationTest` has a catch-all that returns
       * `{ success: false }`; it does not throw. So this branch never runs --
       * and if a future refactor lets it throw, the notification helper will
       * ALREADY have decided whether the failure deserves the owner's group.
       * Paging here would restate that decision a third time.
       *
       * The try/catch stays: a receipt must never take down a payment that is
       * already committed. Only the level changes.
       */
      logger.warn('❌ [DIRECT_PAYMENT v2.0] Ошибка при отправке уведомления', {
        telegram_id,
        operationId,
        error:
          notifyError instanceof Error
            ? notifyError.message
            : String(notifyError),
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
