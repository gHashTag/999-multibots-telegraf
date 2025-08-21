export interface CompetitorSubscription {
  id: string
  user_telegram_id: string
  bot_name: string
  competitor_username: string
  max_reels: number // 1-50
  min_views: number
  max_age_days: number // 1-30
  delivery_format: 'digest' | 'individual' | 'archive'
  is_active: boolean
  created_at: Date
  updated_at: Date
  last_delivery?: Date
}

export interface CreateSubscriptionRequest {
  user_telegram_id: string
  bot_name: string
  competitor_username: string
  max_reels: number
  min_views: number
  max_age_days: number
  delivery_format: 'digest' | 'individual' | 'archive'
}

export interface UpdateSubscriptionRequest {
  max_reels?: number
  min_views?: number
  max_age_days?: number
  delivery_format?: 'digest' | 'individual' | 'archive'
  is_active?: boolean
}

export interface SubscriptionsResponse {
  success: boolean
  subscriptions: CompetitorSubscription[]
  total_count?: number
  active_count?: number
}

export interface SubscriptionResponse {
  success: boolean
  subscription?: CompetitorSubscription
  message?: string
  error?: string
}
