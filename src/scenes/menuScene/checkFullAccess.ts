import { SubscriptionType } from '@/interfaces/subscription.interface'

export const checkFullAccess = (subscription: SubscriptionType): boolean => {
  const fullAccessSubscriptions = [
    'neurophoto',
    'neurobase',
    'neuromeeting',
    'neuroblogger',
    'neurotester',
  ]
  return fullAccessSubscriptions.includes(subscription)
}
