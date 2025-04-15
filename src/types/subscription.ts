export type LocalSubscription = 'stars' | 'subscription'

export interface SubscriptionConfig {
  name: string
  price: number
  stars: number
  duration: number
  description: string
  type: LocalSubscription
}

export const SUBSCRIPTION_TYPES: Record<LocalSubscription, SubscriptionConfig> =
  {
    stars: {
      name: 'Stars',
      price: 0,
      stars: 0,
      duration: 0,
      description: 'Top up balance with stars',
      type: 'stars',
    },
    subscription: {
      name: 'Subscription',
      price: 0,
      stars: 0,
      duration: 30,
      description: 'Monthly subscription',
      type: 'subscription',
    },
  }
