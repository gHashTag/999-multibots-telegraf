/**
 * Типы подписок в системе
 */
export type SubscriptionType = 'neurophoto' | 'neurobase' | 'neuroblogger';

/**
 * Интерфейс для работы с подписками
 */
export interface SubscriptionDetails {
  type: SubscriptionType;
  name: string;
  description: string;
  price: number;
  duration: number; // в днях
  features: string[];
}

/**
 * Статус подписки
 */
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

/**
 * Интерфейс для информации о подписке пользователя
 */
export interface UserSubscription {
  type: SubscriptionType;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
} 