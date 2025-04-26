/**
 * Мок для интерфейса subscription.interface.ts
 */

export enum SubscriptionType {
  STARS = 'STARS',
  NEUROPHOTO = 'NEUROPHOTO',
  NEUROBASE = 'NEUROBASE',
  NEUROTESTER = 'NEUROTESTER',
  NEUROBLOGGER = 'NEUROBLOGGER',
}

export interface Subscription {
  isSubscriptionActive: boolean
  subscriptionType: SubscriptionType | null
  subscriptionStartDate: string | null
  isExist: boolean
  stars: number
}
