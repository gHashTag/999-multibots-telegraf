import { SubscriptionType } from '@/interfaces/payments.interface'

export interface SubscriptionInfo {
  name: string
  price: number
  stars: number
  type: SubscriptionType
}

const subscriptionPrices: Record<SubscriptionType, SubscriptionInfo> = {
  neurobase: {
    name: 'NeuroBase',
    price: 990,
    stars: 1000,
    type: 'neurobase',
  },
  neurophoto: {
    name: 'NeuroPhoto',
    price: 1990,
    stars: 2000,
    type: 'neurophoto',
  },
  neuroblogger: {
    name: 'NeuroBlogger',
    price: 4990,
    stars: 5000,
    type: 'neuroblogger',
  },
  neurotester: {
    name: 'NeuroTester',
    price: 100,
    stars: 100,
    type: 'neurotester',
  },
  neuromeeting: {
    name: 'NeuroMeeting',
    price: 9990,
    stars: 10000,
    type: 'neuromeeting',
  },
  neuromentor: {
    name: 'NeuroMentor',
    price: 19990,
    stars: 20000,
    type: 'neuromentor',
  },
  stars: {
    name: 'Stars',
    price: 100,
    stars: 100,
    type: 'stars',
  },
}

export function getSubscriptionInfo(
  type: SubscriptionType
): SubscriptionInfo | null {
  return subscriptionPrices[type] || null
}
