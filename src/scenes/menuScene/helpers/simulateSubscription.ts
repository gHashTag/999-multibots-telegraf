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
  // Временно всегда возвращаем оригинальную подписку для тестирования
  if (isDev) {
    // Добавляем эту проверку, чтобы было понятно, что это изменение для dev режима
    logger.info(
      '[DEV SIMULATION BYPASSED] Returning original subscription for testing purposes.',
      {
        original: originalSubscription,
        function: 'simulateSubscriptionForDev',
      }
    )
    return originalSubscription
  }
  // Конец временного изменения

  if (!isDev) {
    // В продакшен-режиме всегда возвращаем оригинальную подписку
    return originalSubscription
  }

  // --- !!! РЕЖИМ РАЗРАБОТКИ: СИМУЛЯЦИЯ ПОДПИСКИ !!! ---
  // ЕСЛИ ПОНАДОБИТСЯ АКТИВНАЯ СИМУЛЯЦИЯ, РАСКОММЕНТИРУЙТЕ И НАСТРОЙТЕ БЛОК НИЖЕ
  // А ТАКЖЕ ЗАКОММЕНТИРУЙТЕ БЛОК if(isDev) ВЫШЕ (строки 23-32)
  const simulatedSubscriptionTypeToUse: SubscriptionType | null =
    SubscriptionType.NEUROVIDEO
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
