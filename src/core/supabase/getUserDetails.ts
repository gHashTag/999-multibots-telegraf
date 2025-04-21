// ==================================================================
// ================== ВАЖНЫЙ КОММЕНТАРИЙ! НЕ УДАЛЯТЬ! ==================
// ==================================================================
// Файл: src/core/supabase/getUserDetails.ts
// (Ранее мог называться checkSubscriptionByTelegramId.ts)
//
// НАЗНАЧЕНИЕ:
// Функция `getUserDetails` - ЕДИНЫЙ ГЕТТЕР статуса пользователя.
// Возвращает: Баланс (из payments_v2), Статус подписки (из payments_v2 + 30 дней),
// Флаг существования (из users). НЕ ВОЗВРАЩАЕТ LEVEL.
// ==================================================================

import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  normalizeTelegramId,
  TelegramId,
} from '@/interfaces/telegram.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
// <<<=== ИМПОРТ ДЛЯ ПОЛУЧЕНИЯ БАЛАНСА ИЗ PAYMENTS_V2 ===>>>
import { getUserBalance } from './getUserBalance'
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
 * @function getUserDetails
 * @description **Основной ГЕТТЕР для получения текущего статуса пользователя.**
 *              Объединяет данные:
 *              - Баланс (`stars`) рассчитанный по 'payments_v2' (через `getUserBalance`).
 *              - Флаг существования (`isExist`) из таблицы 'users'.
 *              - Статус активной подписки из 'payments_v2' (проверка типа + 30 дней).
 * @param {TelegramId} telegramId - ID пользователя в Telegram.
 * @returns {Promise<UserDetailsResult>} Объект с актуальным статусом пользователя (БЕЗ level).
 */
export const getUserDetails = async (
  telegramId: TelegramId
): Promise<UserDetailsResult> => {
  // Нормализуем ID
  const telegramIdStr = normalizeTelegramId(telegramId)

  // --- !!! ОТЛАДОЧНЫЙ ЛОГ - ПРОВЕРКА ВЕРСИИ ФУНКЦИИ !!! ---
  logger.info({
    message: `[getUserDetails v3.0 Start] Запрос деталей для User: ${telegramIdStr}`,
    telegramId: telegramIdStr,
  })
  // --- !!! КОНЕЦ ОТЛАДОЧНОГО ЛОГА !!! ---

  // Структура по умолчанию
  const defaultResult: UserDetailsResult = {
    stars: 0,
    subscriptionType: null,
    isSubscriptionActive: false,
    isExist: false,
    subscriptionStartDate: null,
  }

  try {
    // --- ШАГ 1: Получаем БАЛАНС из payments_v2 (через getUserBalance) ---
    // Здесь НЕ ДОЛЖНО быть обращения к users.stars!
    let calculatedStars = 0
    try {
      calculatedStars = await getUserBalance(telegramIdStr)
      logger.info({
        message: `[getUserDetails v3.0 Step 1 OK] Баланс для User: ${telegramIdStr}: ${calculatedStars}`,
        telegramId: telegramIdStr,
      })
    } catch (balanceError) {
      logger.error({
        message: `[getUserDetails v3.0 Step 1 FAIL] Ошибка getUserBalance для User: ${telegramIdStr}`,
        error: balanceError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 2: Проверяем СУЩЕСТВОВАНИЕ пользователя в 'users' ---
    // Запрашиваем НЕ stars, а просто проверяем наличие строки
    let userExists = false
    try {
      const { count, error: userError } = await supabase
        .from('users')
        .select('telegram_id', { count: 'exact', head: true }) // Эффективная проверка
        .eq('telegram_id', telegramIdStr)

      if (userError) {
        if (
          userError.code !== 'PGRST116' &&
          !userError.message.includes('Range requires')
        ) {
          logger.error({
            message: `[getUserDetails v3.0 Step 2 FAIL] Ошибка DB при проверке существования User: ${telegramIdStr}`,
            error: userError.message,
            telegramId: telegramIdStr,
          })
        } else {
          logger.info({
            message: `[getUserDetails v3.0 Step 2 INFO] Пользователь ${telegramIdStr} НЕ найден в таблице users.`,
            telegramId: telegramIdStr,
          })
        }
      } else if (count !== null && count > 0) {
        userExists = true
        logger.info({
          message: `[getUserDetails v3.0 Step 2 OK] Пользователь ${telegramIdStr} найден в таблице users.`,
          telegramId: telegramIdStr,
        })
      } else {
        logger.info({
          message: `[getUserDetails v3.0 Step 2 INFO] Пользователь ${telegramIdStr} НЕ найден в таблице users (count=0 или null).`,
          telegramId: telegramIdStr,
        })
      }
    } catch (existCheckError) {
      logger.error({
        message: `[getUserDetails v3.0 Step 2 FAIL] Непредвиденная ошибка при проверке существования User: ${telegramIdStr}`,
        error: existCheckError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 3: Проверяем активную ПОДПИСКУ из 'payments_v2' + 30 дней ---
    let isActive = false
    let subscriptionTypeDb: 'neurophoto' | 'neurobase' | null = null
    let startDateDb: string | null = null

    try {
      // Ищем последний УСПЕШНЫЙ платеж нужного типа
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments_v2')
        .select('payment_date, subscription_type')
        .eq('telegram_id', telegramIdStr)
        .eq('status', 'COMPLETED')
        .in('subscription_type', ['neurophoto', 'neurobase'])
        .order('payment_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (paymentError) {
        logger.error(
          `[getUserDetails v3.0 Step 3 FAIL] Ошибка DB при поиске платежа за подписку User: ${telegramIdStr}`,
          { error: paymentError.message, telegramId: telegramIdStr }
        )
      } else if (paymentData?.subscription_type) {
        // --- Шаг 3a: Платеж найден, ПРОВЕРЯЕМ СРОК ДЕЙСТВИЯ ---
        subscriptionTypeDb = paymentData.subscription_type as
          | 'neurophoto'
          | 'neurobase'
        startDateDb = paymentData.payment_date
        try {
          if (!startDateDb) {
            throw new Error('Payment date is null')
          }
          const paymentDate = new Date(startDateDb)
          const now = new Date()
          const expirationDate = new Date(paymentDate)
          expirationDate.setDate(
            paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS
          )

          // Основная проверка срока действия
          isActive = now < expirationDate

          logger.info(
            `[getUserDetails v3.0 Step 3 OK] Проверка подписки User: ${telegramIdStr}`,
            {
              isActive,
              type: subscriptionTypeDb,
              paymentDate: startDateDb,
              expirationDate: expirationDate.toISOString(),
            }
          )
        } catch (dateError) {
          logger.error(
            `[getUserDetails v3.0 Step 3 FAIL] Ошибка обработки дат подписки User: ${telegramIdStr}`,
            { error: dateError, paymentDate: startDateDb }
          )
          // isActive останется false
        }
      } else {
        logger.info(
          `[getUserDetails v3.0 Step 3 INFO] Активные платежи за подписку не найдены User: ${telegramIdStr}`
        )
        // isActive остается false
      }
    } catch (subCheckError) {
      logger.error(
        `[getUserDetails v3.0 Step 3 FAIL] Непредвиденная ошибка при проверке подписки User: ${telegramIdStr}`,
        { error: subCheckError }
      )
      // isActive остается false
    }

    // --- Шаг 4: Определяем тип подписки Enum (для возврата) ---
    let mappedSubscriptionType: SubscriptionType | null = null
    if (isActive) {
      // Присваиваем тип только если подписка действительно активна
      if (subscriptionTypeDb === 'neurophoto') {
        mappedSubscriptionType = SubscriptionType.NEUROPHOTO
      } else if (subscriptionTypeDb === 'neurobase') {
        mappedSubscriptionType = SubscriptionType.NEUROBASE
      }
    }

    // --- Шаг 5: Собираем финальный результат ---
    const result: UserDetailsResult = {
      stars: calculatedStars, // Баланс из Шага 1
      subscriptionType: mappedSubscriptionType, // Тип Enum из Шага 4
      isSubscriptionActive: isActive, // Статус активности из Шага 3
      isExist: userExists, // Флаг существования из Шага 2
      subscriptionStartDate: isActive ? startDateDb : null, // Дата старта из Шага 3
    }

    logger.info({
      message: `[getUserDetails v3.0 Finish] Детали пользователя ${telegramIdStr} успешно собраны.`,
      details: result,
    })
    return result
  } catch (error) {
    // --- Шаг 6: Обработка КРИТИЧЕСКИХ/НЕОЖИДАННЫХ ошибок ---
    logger.error({
      message: `[getUserDetails v3.0 CRITICAL FAIL] Непредвиденная ошибка для User: ${telegramIdStr}`,
      error: error instanceof Error ? error.message : String(error),
    })
    return defaultResult
  }
}
