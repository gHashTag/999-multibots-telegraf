import { SubscriptionType } from '@/interfaces/subscription.interface'

export { SubscriptionType }
export type LocalSubscription = SubscriptionType

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

export const subscriptionConfigs: Record<SubscriptionType, SubscriptionConfig> =
  {
    [SubscriptionType.STARS]: {
      title: '⭐ Stars',
      titleRu: '⭐ Звезды',
      titleEn: '⭐ Stars',
      description: 'Basic mode with stars',
      price: 0,
      duration: 0,
      features: ['Pay with stars', 'Basic features', 'Mobile access'],
      stars: 0,
    },
    [SubscriptionType.NEUROPHOTO]: {
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
    [SubscriptionType.NEUROBASE]: {
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
    [SubscriptionType.NEUROMEETING]: {
      title: '🤝 NeuroMeeting',
      titleRu: '🤝 НейроМитинг',
      titleEn: '🤝 NeuroMeeting',
      description: 'Subscription for meetings (copied from NeuroBase)',
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
    [SubscriptionType.NEUROTESTER]: {
      title: '🧪 NeuroTester',
      titleRu: '🧪 НейроТестер',
      titleEn: '🧪 NeuroTester',
      description: 'Test subscription for development',
      price: 5,
      duration: 1,
      features: ['Test features', 'Development access', 'Basic support'],
      stars: 5,
    },
    [SubscriptionType.NEUROBLOGGER]: {
      title: '✍️ NeuroBlogger',
      titleRu: '✍️ НейроБлоггер',
      titleEn: '✍️ NeuroBlogger',
      description: 'Professional blogging and content creation',
      price: 75000,
      duration: 30,
      features: [
        'All functions of NeuroBase',
        'Advanced content generation',
        'SEO optimization',
        'Content planning',
        'Analytics and insights',
        'Priority processing',
        'Dedicated support team',
      ],
      stars: 32608,
    },
  }
