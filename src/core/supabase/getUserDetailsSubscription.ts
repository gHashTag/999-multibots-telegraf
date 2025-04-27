// ==================================================================
// ================== ВАЖНЫЙ КОММЕНТАРИЙ! НЕ УДАЛЯТЬ! ==================
// ==================================================================
// Файл: src/core/supabase/getUserDetailsSubscription.ts
// (Ранее мог называться checkSubscriptionByTelegramId.ts)
//
// НАЗНАЧЕНИЕ:
// Функция `getUserDetailsSubscription` - ЕДИНЫЙ ГЕТТЕР статуса пользователя.
// Возвращает: Баланс (из payments_v2), Статус подписки (из payments_v2 + 30 дней),
// Флаг существования (из users). НЕ ВОЗВРАЩАЕТ LEVEL.
// ==================================================================

import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  normalizeTelegramId,
  type TelegramId,
} from '@/interfaces/telegram.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
// <<<=== ИМПОРТ ДЛЯ ПОЛУЧЕНИЯ БАЛАНСА ИЗ PAYMENTS_V2 ===>>>
import { getUserBalance } from './getUserBalance'
import { PaymentStatus } from '@/interfaces/payments.interface'
// Импорт интерфейса (убедись, что он не содержит level)

interface UserDetailsResult {
  stars: number
  subscriptionType: SubscriptionType | null
  isSubscriptionActive: boolean
  isExist: boolean
  subscriptionStartDate: string | null
}

// Длительность подписки в днях
const SUBSCRIPTION_DURATION_DAYS = 30

/**
 * @function getUserDetailsSubscription
 * @description **Основной ГЕТТЕР для получения текущего статуса пользователя.**
 *              Объединяет данные:
 *              - Баланс (`stars`) рассчитанный по 'payments_v2' (через `getUserBalance`).
 *              - Флаг существования (`isExist`) из таблицы 'users'.
 *              - Статус активной подписки из 'payments_v2' (проверка типа + 30 дней).
 * @param {TelegramId} telegramId - ID пользователя в Telegram.
 * @returns {Promise<UserDetailsResult>} Объект с актуальным статусом пользователя (БЕЗ level).
 */
export const getUserDetailsSubscription = async (
  telegramId: TelegramId
): Promise<UserDetailsResult> => {
  const telegramIdStr = normalizeTelegramId(telegramId)
  logger.info(
    `[getUserDetailsSubscription v4.0 SIMPLE Start] Запрос деталей для User: ${telegramIdStr}`,
    { telegramId: telegramIdStr }
  )

  const defaultResult: UserDetailsResult = {
    stars: 0,
    subscriptionType: null,
    isSubscriptionActive: false,
    isExist: false,
    subscriptionStartDate: null,
  }

  try {
    // --- ШАГ 1: Баланс (оставляем как есть) ---
    let calculatedStars = 0
    try {
      calculatedStars = await getUserBalance(telegramIdStr)
      logger.info(
        `[getUserDetailsSubscription v4.0 SIMPLE Step 1 OK] Баланс: ${calculatedStars}`,
        { telegramId: telegramIdStr }
      )
    } catch (balanceError) {
      logger.error({
        message: `[getUserDetailsSubscription v4.0 SIMPLE Step 1 FAIL] Ошибка getUserBalance для User: ${telegramIdStr}`,
        error: balanceError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 2: Существование пользователя (оставляем как есть) ---
    let userExists = false
    try {
      const { count, error: userError } = await supabase
        .from('users')
        .select('telegram_id', { count: 'exact', head: true })
        .eq('telegram_id', telegramIdStr)

      if (userError) {
        if (
          userError.code !== 'PGRST116' &&
          !userError.message.includes('Range requires')
        ) {
          logger.error({
            message: `[getUserDetailsSubscription v4.0 SIMPLE Step 2 FAIL] Ошибка DB при проверке существования User: ${telegramIdStr}`,
            error: userError.message,
            telegramId: telegramIdStr,
          })
        } else {
          logger.info({
            message: `[getUserDetailsSubscription v4.0 SIMPLE Step 2 INFO] Пользователь ${telegramIdStr} НЕ найден в таблице users.`,
            telegramId: telegramIdStr,
          })
        }
      } else if (count !== null && count > 0) {
        userExists = true
      } else {
        // userExists остается false
      }
      logger.info(
        `[getUserDetailsSubscription v4.0 SIMPLE Step 2 OK] Пользователь существует: ${userExists}`,
        { telegramId: telegramIdStr }
      )
    } catch (existCheckError) {
      logger.error({
        message: `[getUserDetailsSubscription v4.0 SIMPLE Step 2 FAIL] Непредвиденная ошибка при проверке существования User: ${telegramIdStr}`,
        error: existCheckError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 3: ПОДПИСКА - НОВАЯ ПРОСТАЯ ЛОГИКА ---
    let isActive = false
    let finalSubscriptionType: SubscriptionType | null = null
    let startDateDb: string | null = null

    try {
      // Ищем ПОСЛЕДНЮЮ завершенную запись с НЕПУСТЫМ subscription_type
      const { data: subData, error: subError } = await supabase
        .from('payments_v2')
        .select('subscription_type, payment_date') // Берем только нужное
        .eq('telegram_id', telegramIdStr)
        .eq('status', PaymentStatus.COMPLETED)
        .not('subscription_type', 'is', null) // ГЛАВНОЕ УСЛОВИЕ
        .order('payment_date', { ascending: false }) // Самая свежая запись
        .limit(1)
        .maybeSingle() // Ожидаем одну или ноль записей

      if (subError) {
        logger.error(
          `[getUserDetailsSubscription v4.0 SIMPLE Step 3 FAIL] Ошибка DB при поиске подписки User: ${telegramIdStr}`,
          { error: subError.message, telegramId: telegramIdStr }
        )
      } else if (subData && subData.subscription_type && subData.payment_date) {
        // Запись найдена! Проверяем ее
        const rawSubscriptionType = subData.subscription_type as string
        startDateDb = subData.payment_date

        // Преобразуем строку из БД в Enum (регистронезависимо)
        let foundSubType: SubscriptionType | null = null
        const upperCaseSubType = rawSubscriptionType.toUpperCase()

        if (upperCaseSubType === SubscriptionType.NEUROPHOTO) {
          foundSubType = SubscriptionType.NEUROPHOTO
        } else if (upperCaseSubType === SubscriptionType.NEUROBASE) {
          foundSubType = SubscriptionType.NEUROBASE
        } else if (upperCaseSubType === SubscriptionType.NEUROTESTER) {
          foundSubType = SubscriptionType.NEUROTESTER
        } else if (upperCaseSubType === SubscriptionType.NEUROBLOGGER) {
          // Добавим на всякий случай
          foundSubType = SubscriptionType.NEUROBLOGGER
        }
        // Добавить другие типы если нужно

        if (!foundSubType) {
          logger.warn(
            `[getUserDetailsSubscription v4.0 SIMPLE Step 3 WARN] Неизвестный subscription_type из БД: ${rawSubscriptionType}`,
            { telegramId: telegramIdStr }
          )
        } else {
          // Тип подписки распознан, запоминаем его СРАЗУ
          finalSubscriptionType = foundSubType

          // Теперь проверяем активность
          if (foundSubType === SubscriptionType.NEUROTESTER) {
            isActive = true // Тестеры активны всегда
            logger.info(
              `[getUserDetailsSubscription v4.0 SIMPLE Step 3 OK] NEUROTESTER активен (безлимит)`,
              {
                telegramId: telegramIdStr,
                type: finalSubscriptionType,
                date: startDateDb,
              }
            )
          } else {
            // Проверяем дату для остальных
            try {
              const paymentDate = new Date(startDateDb)
              const now = new Date()
              const expirationDate = new Date(paymentDate)
              expirationDate.setDate(
                paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS
              )
              isActive = now < expirationDate // Активна, если не истекла
              logger.info(
                `[getUserDetailsSubscription v4.0 SIMPLE Step 3 OK] Проверка подписки`,
                {
                  telegramId: telegramIdStr,
                  type: foundSubType,
                  date: startDateDb,
                  expiration: expirationDate.toISOString(),
                  isActive,
                }
              )
            } catch (dateError) {
              logger.error(
                `[getUserDetailsSubscription v4.0 SIMPLE Step 3 FAIL] Ошибка дат`,
                {
                  telegramId: telegramIdStr,
                  error: dateError,
                  date: startDateDb,
                }
              )
              isActive = false // Считаем неактивной при ошибке даты
            }
          }
        }
      } else {
        // Записей с непустым subscription_type не найдено
        logger.info(
          `[getUserDetailsSubscription v4.0 SIMPLE Step 3 INFO] Активная подписка (по subscription_type) не найдена`,
          { telegramId: telegramIdStr }
        )
        isActive = false
        finalSubscriptionType = null
        startDateDb = null
      }
    } catch (subCheckError) {
      logger.error(
        `[getUserDetailsSubscription v4.0 SIMPLE Step 3 FAIL] Непредвиденная ошибка при проверке подписки User: ${telegramIdStr}`,
        { error: subCheckError }
      )
      isActive = false
      finalSubscriptionType = null
      startDateDb = null
    }

    // --- ШАГ 4: Собираем финальный результат ---
    const result: UserDetailsResult = {
      stars: calculatedStars,
      subscriptionType: finalSubscriptionType, // Тип из Шага 3 (теперь не зависит от isActive, кроме как при ненахождении)
      isSubscriptionActive: isActive, // Активность из Шага 3
      isExist: userExists,
      subscriptionStartDate: startDateDb, // Дата из Шага 3 (теперь не зависит от isActive)
    }

    logger.info(`[getUserDetailsSubscription v4.0 SIMPLE Finish] Результат`, {
      telegramId: telegramIdStr,
      details: result,
    })
    return result
  } catch (error) {
    logger.error({
      message: `[getUserDetailsSubscription v4.0 SIMPLE CRITICAL FAIL] Непредвиденная ошибка для User: ${telegramIdStr}`,
      error: error instanceof Error ? error.message : String(error),
    })
    return defaultResult
  }
}
