import { SubscriptionType } from '@/interfaces/subscription.interface'
import { SUBSCRIPTION_CONFIG } from '@/config/subscription.config'

export interface SubscriptionInfo {
  title_ru: string
  title_en: string
  price_ru: number
  price_en: number
  stars: number
}

export function getSubscriptionInfo(
  type: SubscriptionType
): SubscriptionInfo | null {
  const config = SUBSCRIPTION_CONFIG[type]
  if (!config) {
    return null
  }

  return {
    title_ru: config.title_ru,
    title_en: config.title_en,
    price_ru: config.price_ru,
    price_en: config.price_en,
    stars: config.stars,
  }
}
