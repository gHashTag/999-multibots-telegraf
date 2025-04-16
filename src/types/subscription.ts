export type Subscription = 'neurophoto' | 'neurobase'

export type LocalSubscription = Subscription | 'stars'

export interface SubscriptionConfig {
  title: string
  titleRu: string
  titleEn: string
  description: string
  price: number
  duration: number
  features: string[]
  stars: number
}

export const subscriptionConfigs: Record<Subscription, SubscriptionConfig> = {
  neurophoto: {
    title: '🎨 NeuroPhoto',
    titleRu: '🎨 НейроФото',
    titleEn: '🎨 NeuroPhoto',
    description: 'Basic photo editing and generation',
    price: 1110,
    duration: 30,
    features: [
      'Image generation',
      'Photo editing',
      'Basic effects',
      'Access to basic models',
      '24/7 support',
    ],
    stars: 476,
  },
  neurobase: {
    title: '📚 NeuroBase',
    titleRu: '📚 НейроБаза',
    titleEn: '📚 NeuroBase',
    description: 'Advanced features and priority support',
    price: 2999,
    duration: 30,
    features: [
      'All functions of NeuroPHOTO',
      'Advanced effects',
      'Priority support',
      'Access to all models',
      'Personal manager',
    ],
    stars: 1303,
  },
}
