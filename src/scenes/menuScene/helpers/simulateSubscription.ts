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
  const devSimulateSubscription = process.env.DEV_SIMULATE_SUBSCRIPTION

  logger.info('[DEV SIMULATION] Debug env variable', {
    DEV_SIMULATE_SUBSCRIPTION: devSimulateSubscription,
    originalSubscription,
  })

  // Если переменная установлена, используем её значение
  if (devSimulateSubscription) {
    const simulatedType = devSimulateSubscription as SubscriptionType

    // Проверяем что это валидный тип подписки
    const validTypes = ['NEUROPHOTO', 'NEUROVIDEO', 'NEUROTESTER', 'STARS']
    if (!validTypes.includes(simulatedType)) {
      logger.warn(
        '[DEV SIMULATION] Invalid subscription type in env, using null',
        {
          invalid: simulatedType,
          valid: validTypes,
        }
      )
      return null
    }

    logger.warn('[DEV SIMULATION] Subscription type is being simulated!', {
      original: originalSubscription,
      simulated: simulatedType,
      function: 'simulateSubscriptionForDev',
    })
    return simulatedType
  }

  // Если переменная не установлена, возвращаем оригинальную подписку
  logger.info(
    '[DEV SIMULATION] No simulation variable set, using original subscription',
    {
      original: originalSubscription,
    }
  )
  return originalSubscription
}
