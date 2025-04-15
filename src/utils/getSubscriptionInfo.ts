import {
  subscriptionConfigs,
  type LocalSubscription,
} from '../types/subscription'

export interface SubscriptionInfo {
  title_ru: string
  title_en: string
  ru_price: number
  en_price: number
  stars_price: number
}

export function getSubscriptionInfo(
  type: LocalSubscription
): SubscriptionInfo | null {
  if (type === 'stars') {
    return null
  }

  const config = subscriptionConfigs[type]

  return {
    title_ru: config.titleRu,
    title_en: config.titleEn,
    ru_price: config.price,
    en_price: config.price,
    stars_price: config.stars,
  }
}
