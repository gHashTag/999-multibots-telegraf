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
  TelegramId,
} from '@/interfaces/telegram.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
// <<<=== ИМПОРТ ДЛЯ ПОЛУЧЕНИЯ БАЛАНСА ИЗ PAYMENTS_V2 ===>>>
import { getUserBalance } from './getUserBalance'
import { PaymentStatus } from '@/interfaces/payments.interface'
// <<<=== ИМПОРТ ADMIN_IDS ===>>>
import { ADMIN_IDS_ARRAY } from '@/config'
// Импорт интерфейса (убедись, что он не содержит level)

// Экспортируем интерфейс
export interface UserDetailsResult {
  id: number
  created_at: string
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
  console.log('🔍 [getUserDetailsSubscription] Checking user:', {
    telegram_id: telegramIdStr,
    input_type: typeof telegramId,
    normalized: telegramIdStr,
  })
  logger.info(
    `[getUserDetailsSubscription v4.0 SIMPLE Start] Запрос деталей для User: ${telegramIdStr}`,
    { telegramId: telegramIdStr }
  )

  const defaultResult: UserDetailsResult = {
    id: 0,
    created_at: '',
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
      logger.error(`[getUserDetailsSubscription v4.0 SIMPLE Step 1 FAIL] Ошибка getUserBalance для User: ${telegramIdStr}`, {
        error: balanceError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 2: Существование пользователя (оставляем как есть) ---
    let userExists = false
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id') // Выбираем id (или любое другое не-null поле)
        .eq('telegram_id', telegramIdStr)
        .maybeSingle() // Ожидаем одну запись или null

      if (userError) {
        if (
          userError.code !== 'PGRST116' &&
          !userError.message.includes('Range requires')
        ) {
          logger.error(`[getUserDetailsSubscription v4.0 SIMPLE Step 2 FAIL] Ошибка DB при проверке существования User: ${telegramIdStr}`, {
            error: userError.message,
            telegramId: telegramIdStr,
          })
        } else {
          logger.info(`[getUserDetailsSubscription v4.0 SIMPLE Step 2 INFO] Пользователь ${telegramIdStr} НЕ найден в таблице users или недоступен (RLS?).`, {
            telegramId: telegramIdStr,
          })
        }
      } else if (userData) {
        // <--- ЕСЛИ userData не null (т.е. запись найдена и доступна)
        console.log(
          '✅ [getUserDetailsSubscription] User FOUND in users table:',
          {
            telegram_id: telegramIdStr,
            user_id: userData.id,
          }
        )
        userExists = true // <--- Устанавливаем true
      } else {
        // userData === null (запись не найдена или скрыта RLS)
        // userExists остается false
        console.log(
          '❌ [getUserDetailsSubscription] User NOT FOUND in users table:',
          {
            telegram_id: telegramIdStr,
          }
        )
        logger.info(`[getUserDetailsSubscription v4.0 SIMPLE Step 2 INFO] Пользователь ${telegramIdStr} НЕ найден в таблице users или недоступен (RLS?).`, {
          telegramId: telegramIdStr,
        })
      }
      logger.info(
        `[getUserDetailsSubscription v4.0 SIMPLE Step 2 OK] Пользователь существует: ${userExists}`,
        { telegramId: telegramIdStr }
      )
    } catch (existCheckError) {
      logger.error(`[getUserDetailsSubscription v4.0 SIMPLE Step 2 FAIL] Непредвиденная ошибка при проверке существования User: ${telegramIdStr}`, {
        error: existCheckError,
        telegramId: telegramIdStr,
      })
    }

    // --- ШАГ 3: ПОДПИСКА - ИСПРАВЛЕННАЯ ЛОГИКА ДЛЯ ПОИСКА АКТИВНЫХ ПОДПИСОК ---
    let isActive = false
    let finalSubscriptionType: SubscriptionType | null = null
    let startDateDb: string | null = null

    // 👑 ПРОВЕРКА ДЛЯ АДМИНОВ - АВТОМАТИЧЕСКИ ДАЕМ NEUROTESTER ПОДПИСКУ
    const telegramIdNum = parseInt(telegramIdStr, 10)
    const isAdmin = ADMIN_IDS_ARRAY.includes(telegramIdNum)

    console.log(`🔍 [getUserDetailsSubscription] Проверка админа для ${telegramIdStr}:`, {
      isAdmin,
      adminIds: ADMIN_IDS_ARRAY,
    })

    if (isAdmin) {
      console.log(`✅ [getUserDetailsSubscription] Админ ${telegramIdStr} автоматически получает подписку NEUROTESTER`)
      isActive = true
      finalSubscriptionType = SubscriptionType.NEUROTESTER
      startDateDb = new Date().toISOString()
    } else {
      console.log(`ℹ️ [getUserDetailsSubscription] Пользователь ${telegramIdStr} не админ, проверяем подписку через payments_v2`)

      try {
      // Ищем активные подписки по приоритету: NEUROTESTER > NEUROVIDEO > NEUROPHOTO
      const subscriptionPriority = [
        SubscriptionType.NEUROTESTER,
        SubscriptionType.NEUROVIDEO,
        SubscriptionType.NEUROPHOTO,
      ]

      for (const subscriptionType of subscriptionPriority) {
        // Ищем последнюю подписку этого типа
        const { data: subData, error: subError } = await supabase
          .from('payments_v2')
          .select('subscription_type, payment_date')
          .eq('telegram_id', telegramIdStr)
          .eq('status', PaymentStatus.COMPLETED)
          .eq('subscription_type', subscriptionType)
          .order('payment_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (subError) {
          logger.error(
            `[getUserDetailsSubscription v4.0 FIXED Step 3] Ошибка поиска ${subscriptionType}`,
            {
              error: subError.message,
              telegramId: telegramIdStr,
              subscriptionType,
            }
          )
          continue
        }

        if (!subData || !subData.subscription_type || !subData.payment_date) {
          continue // Нет подписки этого типа
        }

        const rawSubscriptionType = subData.subscription_type as string
        const upperCaseSubType = rawSubscriptionType.toUpperCase()

        // Проверяем что тип подписки корректный
        if (upperCaseSubType !== subscriptionType.toString()) {
          continue
        }

        // Проверяем активность
        let isThisTypeActive = false
        let expirationDate: Date | null = null

        if (subscriptionType === SubscriptionType.NEUROTESTER) {
          // NEUROTESTER всегда активна
          isThisTypeActive = true
        } else {
          // NEUROPHOTO, NEUROVIDEO - временные подписки (30 дней)
          const paymentDate = new Date(subData.payment_date)
          const now = new Date()
          expirationDate = new Date(paymentDate)
          expirationDate.setDate(
            paymentDate.getDate() + SUBSCRIPTION_DURATION_DAYS
          )
          isThisTypeActive = now < expirationDate
        }

        if (isThisTypeActive) {
          // Найдена активная подписка!
          isActive = true
          finalSubscriptionType = subscriptionType
          startDateDb = subData.payment_date

          logger.info(
            `[getUserDetailsSubscription v4.0 FIXED Step 3 SUCCESS] Найдена активная подписка`,
            {
              telegramId: telegramIdStr,
              type: subscriptionType,
              date: startDateDb,
              expiration: expirationDate
                ? expirationDate.toISOString()
                : 'Не ограничена (NEUROTESTER)',
              priority: subscriptionPriority.indexOf(subscriptionType) + 1,
            }
          )
          break // Прерываем поиск - нашли активную подписку с наивысшим приоритетом
        } else {
          logger.info(
            `[getUserDetailsSubscription v4.0 FIXED Step 3 INFO] Подписка ${subscriptionType} истекла`,
            {
              telegramId: telegramIdStr,
              type: subscriptionType,
              date: subData.payment_date,
              expiration: expirationDate ? expirationDate.toISOString() : 'N/A',
              expired: true,
            }
          )
        }
      }

        if (!isActive) {
          logger.info(
            `[getUserDetailsSubscription v4.0 FIXED Step 3 INFO] Активных подписок не найдено`,
            { telegramId: telegramIdStr }
          )
        }
      } catch (subCheckError) {
        logger.error(
          `[getUserDetailsSubscription v4.0 FIXED Step 3 FAIL] Непредвиденная ошибка при проверке подписки User: ${telegramIdStr}`,
          { error: subCheckError, telegramId: telegramIdStr }
        )
        isActive = false
        finalSubscriptionType = null
        startDateDb = null
      }
    }

    // --- ШАГ 4: Собираем финальный результат ---
    const result: UserDetailsResult = {
      id: 0,
      created_at: '',
      stars: calculatedStars,
      subscriptionType: finalSubscriptionType, // Тип из Шага 3
      isSubscriptionActive: isActive, // Активность из Шага 3
      isExist: userExists,
      subscriptionStartDate: isActive ? startDateDb : null,
    }

    console.log('📦 [getUserDetailsSubscription] FINAL RESULT:', {
      telegram_id: telegramIdStr,
      isExist: result.isExist,
      stars: result.stars,
      subscriptionType: result.subscriptionType,
      isSubscriptionActive: result.isSubscriptionActive,
    })

    logger.info(`[getUserDetailsSubscription v4.0 FIXED Finish] Результат`, {
      telegramId: telegramIdStr,
      details: result,
    })
    return result
  } catch (error) {
    logger.error(`[getUserDetailsSubscription v4.0 SIMPLE CRITICAL FAIL] Непредвиденная ошибка для User: ${telegramIdStr}`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return defaultResult
  }
}
