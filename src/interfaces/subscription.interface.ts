/**
 * Перечисление типов подписок
 */
export enum SubscriptionType {
  STANDARD = 'standard',
  PREMIUM = 'premium',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Перечисление статусов подписок
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIAL = 'trial',
}

/**
 * Интерфейс подписки
 */
export interface Subscription {
  id: string
  userId: string | number
  type: SubscriptionType
  startDate: Date | string
  endDate: Date | string
  status: string
  autoRenew: boolean
  price: number
  currency: string
  createdAt: Date | string
  updatedAt: Date | string
  metadata?: Record<string, any>
}

/**
 * Интерфейс параметров для создания подписки
 */
export interface SubscriptionCreateParams {
  userId: string | number
  type: SubscriptionType
  duration?: number // в днях
  autoRenew?: boolean
  price?: number
  currency?: string
  metadata?: Record<string, any>
}

/**
 * Интерфейс параметров для обновления подписки
 */
export interface SubscriptionUpdateParams {
  type?: SubscriptionType
  endDate?: string
  status?: string
  autoRenew?: boolean
  price?: number
  currency?: string
  metadata?: Record<string, any>
}

/**
 * Интерфейс результата валидации подписки
 */
export interface SubscriptionValidationResult {
  isValid: boolean
  subscription?: Subscription
  error?: string
  message: string
}

/**
 * Интерфейс результата операции с подпиской
 */
export interface SubscriptionOperationResult {
  success: boolean
  subscription?: Subscription
  error?: string
  message: string
}

/**
 * Константы для подписок
 */
export const SUBSCRIPTION_DEFAULTS = {
  DURATION: 30, // в днях
  CURRENCY: 'RUB',
  AUTO_RENEW: false,
  STANDARD_PRICE_RUB: 499,
  PREMIUM_PRICE_RUB: 999,
  PRO_PRICE_RUB: 1999,
  ENTERPRISE_PRICE_RUB: 4999,
  STANDARD_PRICE_USD: 7,
  PREMIUM_PRICE_USD: 14,
  PRO_PRICE_USD: 29,
  ENTERPRISE_PRICE_USD: 79,
}

/**
 * Константы сообщений об ошибках подписок
 */
export const SUBSCRIPTION_ERROR_MESSAGES = {
  NOT_FOUND: 'subscription_not_found',
  ALREADY_EXISTS: 'subscription_already_exists',
  EXPIRED: 'subscription_expired',
  INVALID_TYPE: 'invalid_subscription_type',
  DATABASE_ERROR: 'database_error',
}

/**
 * Константы сообщений об успешных операциях с подписками
 */
export const SUBSCRIPTION_SUCCESS_MESSAGES = {
  CREATED: 'Подписка успешно создана',
  UPDATED: 'Подписка успешно обновлена',
  VALIDATED: 'У вас есть активная подписка',
  CANCELLED: 'Подписка успешно отменена',
  RENEWED: 'Подписка успешно продлена',
}

/**
 * Статистика подписок
 */
export interface SubscriptionStats {
  totalActive: number
  byType: {
    [key in SubscriptionType]?: number
  }
  totalRevenue: number
  averageDuration: number
  renewalRate: number
}

/**
 * Параметры продления подписки
 */
export interface SubscriptionRenewalParams {
  subscriptionId: string
  duration?: number // в днях
  price?: number
  currency?: 'RUB' | 'USD'
}
