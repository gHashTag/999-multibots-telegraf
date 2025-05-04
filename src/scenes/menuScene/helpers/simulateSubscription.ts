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
  // --- !!! НАСТРОЙКА СИМУЛЯЦИИ (ТОЛЬКО ДЛЯ РАЗРАБОТКИ) !!! ---
  // Измените значение `simulatedSubscriptionType` на нужный тип SubscriptionType
  // для тестирования различных уровней доступа и сценариев меню.
  // Доступные типы: NEUROBASE, NEURO_PRO, NEUROTESTER, NEUROPHOTO, STARS, или null (нет подписки).
  const simulatedSubscriptionType: SubscriptionType | null =
    SubscriptionType.NEUROBASE
  // ---------------------------------------------------------

  if (!isDev) {
    // В продакшен-режиме всегда возвращаем оригинальную подписку
    return originalSubscription
  }

  // --- !!! РЕЖИМ РАЗРАБОТКИ: СИМУЛЯЦИЯ ПОДПИСКИ !!! ---
  // ЗАМЕНИТЕ ЗНАЧЕНИЕ НИЖЕ НА НУЖНЫЙ ТИП SubscriptionType ДЛЯ ТЕСТИРОВАНИЯ
  // const simulatedSubscriptionType: SubscriptionType | null = SubscriptionType.NEUROBASE;
  // Например:
  // const simulatedSubscriptionType: SubscriptionType | null = SubscriptionType.NEURO_PRO;
  // const simulatedSubscriptionType: SubscriptionType | null = null; // Для симуляции отсутствия подписки
  // -----------------------------------------------------

  if (simulatedSubscriptionType !== originalSubscription) {
    logger.warn('[DEV SIMULATION] Subscription type is being simulated!', {
      original: originalSubscription,
      simulated: simulatedSubscriptionType,
      function: 'simulateSubscriptionForDev',
    })
    return simulatedSubscriptionType
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
