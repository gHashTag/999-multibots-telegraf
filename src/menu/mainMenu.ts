/**
 * 📱 MAIN MENU - HELPER FUNCTIONS
 *
 * ВНИМАНИЕ: ЭТОТ ФАЙЛ БОЛЬШЕ НЕ СОЗДАЕТ КНОПКИ!
 * Все кнопки теперь в src/simpleSceneMenu.ts
 *
 * Здесь только helper функции для других компонентов
 */

import { isDev, isRussian, isText } from '@/helpers'
import { ADMIN_IDS } from '@/config'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// ✅ Только helper функции!

/**
 * Проверяет, может ли пользователь получить доступ к парсингу
 */
export const getParsingAccess = (userId: string): boolean => {
  const isMainAdmin = ADMIN_IDS.includes(parseInt(userId))
  const hasAccess = isMainAdmin

  return hasAccess
}

/**
 * Функция для проверки админ доступа
 */
export const hasAdminAccess = (userId: string): boolean => {
  return ADMIN_IDS.includes(parseInt(userId))
}

/**
 * Helper для получения названия подписки на русском
 */
export const getSubscriptionDisplayName = (subscription: string | null): string => {
  if (!subscription) return 'Без подписки'

  switch (subscription) {
    case SubscriptionType.NEUROPHOTO:
      return 'NEUROPHOTO'
    case SubscriptionType.NEUROVIDEO:
      return 'NEUROVIDEO'
    case SubscriptionType.NEUROTESTER:
      return 'NEUROTESTER'
    case SubscriptionType.NO_SUBSCRIPTION:
      return 'Без подписки'
    default:
      return subscription
  }
}

/**
 * Проверяет, является ли пользователь админом
 */
export const isUserAdmin = (userId: number): boolean => {
  return ADMIN_IDS.includes(userId)
}

/**
 * Helper для логирования подписки
 */
export const getSubscriptionLogInfo = (subscription: string | null) => {
  return {
    subscription,
    subscriptionDisplayName: getSubscriptionDisplayName(subscription),
    isDev,
  }
}
