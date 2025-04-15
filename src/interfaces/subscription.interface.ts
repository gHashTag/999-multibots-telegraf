/**
 * Интерфейс подписки пользователя
 */
export interface UserSubscription {
  id: number
  user_id: number | string
  plan_id: string
  is_active: boolean
  expires_at: Date | null
  created_at: Date
  updated_at: Date
  tariff_id: number
  discord_id: string | null
  customer_id: string | null
  subscription_id: string | null
  status: 'active' | 'canceled' | 'trial' | 'pending'
  canceled_at: Date | null
  payment_id: string | null
}
