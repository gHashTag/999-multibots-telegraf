export interface InstagramUser {
  id: string
  username: string
  full_name: string
  followers_count: number
  following_count: number
  media_count: number
  is_verified: boolean
  is_private: boolean
  profile_pic_url?: string
  bio?: string
  external_url?: string
  category?: string
  is_business_account?: boolean
}

export interface ValidatedInstagramUser extends InstagramUser {
  similarity_score?: number
  analysis_metadata?: Record<string, any>
}

export interface InstagramReel {
  id: string
  shortcode: string
  user_id: string
  caption?: string
  media_url: string
  thumbnail_url?: string
  video_duration?: number
  view_count?: number
  like_count?: number
  comment_count?: number
  created_at: Date
  hashtags?: string[]
  mentions?: string[]
}

export interface InstagramScrapingEvent {
  username_or_id: string
  project_id: number
  max_users?: number
  max_reels_per_user?: number
  scrape_reels?: boolean
  requester_telegram_id: string
  bot_name?: string
}

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