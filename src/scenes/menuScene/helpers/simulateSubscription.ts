import { SubscriptionType } from '@/interfaces/subscription.interface'
import { logger } from '@/utils'

/**
 * Симулирует тип подписки пользователя в режиме разработки (isDev=true).
 * Позволяет легко тестировать различное поведение меню/доступа для разных уровней подписки.
 * ВАЖНО: Эта функция предназначена ТОЛЬКО для режима разработки!
 *
 * @param originalSubscription Исходный тип подписки пользователя.
 * @param isDev Флаг режима разработки.
 * @returns Тип подписки (оригинальный или симулированный).
 */
export function simulateSubscriptionForDev(
  originalSubscription: SubscriptionType | null,
  isDev: boolean
): SubscriptionType | null {
  if (!isDev) {
    // В продакшен-режиме всегда возвращаем оригинальную подписку
    return originalSubscription
  }

  // --- !!! РЕЖИМ РАЗРАБОТКИ: СИМУЛЯЦИЯ ПОДПИСКИ !!! ---
  // Проверяем переменную окружения для конкретной симуляции
  const devSimulateSubscription = process.env
    .DEV_SIMULATE_SUBSCRIPTION as SubscriptionType

  // В dev режиме симулируем полный доступ для тестирования
  const simulatedSubscriptionTypeToUse: SubscriptionType | null =
    devSimulateSubscription || SubscriptionType.NEUROVIDEO // ✅ ДАЕТ ПОЛНЫЙ ДОСТУП для тестирования всех функций
  if (simulatedSubscriptionTypeToUse !== originalSubscription) {
    logger.warn('[DEV SIMULATION] Subscription type is being simulated!', {
      original: originalSubscription,
      simulated: simulatedSubscriptionTypeToUse,
      function: 'simulateSubscriptionForDev',
    })
    return simulatedSubscriptionTypeToUse
  } else {
    logger.info(
      '[DEV SIMULATION] Simulation requested, but simulated type matches original. Using original.',
      {
        original: originalSubscription,
        function: 'simulateSubscriptionForDev',
      }
    )
    return originalSubscription
  }
}
