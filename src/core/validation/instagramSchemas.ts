import { z } from 'zod'

// Instagram User Schema for API validation
export const InstagramUserSchema = z.object({
  id: z.string(),
  username: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/, 'Invalid Instagram username format'),
  full_name: z.string().optional(),
  followers_count: z.number().int().min(0),
  following_count: z.number().int().min(0),
  media_count: z.number().int().min(0),
  is_verified: z.boolean().default(false),
  is_private: z.boolean().default(false),
  profile_pic_url: z.string().url().optional(),
  bio: z.string().optional(),
  external_url: z.string().url().optional(),
  category: z.string().optional(),
  is_business_account: z.boolean().default(false),
})

// Validated Instagram User Schema for database
export const ValidatedInstagramUserSchema = InstagramUserSchema.extend({
  similarity_score: z.number().min(0).max(100).optional(),
  analysis_metadata: z.record(z.any()).optional(),
})

// Instagram Scraping Event Schema
export const InstagramScrapingEventSchema = z.object({
  username_or_id: z.string().min(1, 'Username is required'),
  project_id: z.number().int().positive('Project ID must be positive'),
  max_users: z.number().int().min(1).max(100).default(50),
  max_reels_per_user: z.number().int().min(1).max(200).default(50),
  scrape_reels: z.boolean().default(false),
  requester_telegram_id: z.string().min(1, 'Requester Telegram ID is required'),
  bot_name: z.string().optional(),
})

// Raw Instagram Reel Schema
export const RawInstagramReelSchema = z.object({
  id: z.string(),
  shortcode: z.string(),
  user_id: z.string(),
  caption: z.string().optional(),
  media_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  video_duration: z.number().positive().optional(),
  view_count: z.number().int().min(0).optional(),
  like_count: z.number().int().min(0).optional(),
  comment_count: z.number().int().min(0).optional(),
  created_at: z.date(),
  hashtags: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
})

// Create Subscription Schema
export const CreateSubscriptionSchema = z.object({
  user_telegram_id: z.string().min(1, 'Telegram ID is required'),
  bot_name: z.string().min(1, 'Bot name is required'),
  competitor_username: z.string()
    .regex(/^[a-zA-Z0-9._]{1,30}$/, 'Invalid Instagram username format')
    .min(1, 'Competitor username is required'),
  max_reels: z.number().int().min(1).max(50).default(10),
  min_views: z.number().int().min(0).default(1000),
  max_age_days: z.number().int().min(1).max(30).default(7),
  delivery_format: z.enum(['digest', 'individual', 'archive']).default('digest'),
})

// Update Subscription Schema
export const UpdateSubscriptionSchema = z.object({
  max_reels: z.number().int().min(1).max(50).optional(),
  min_views: z.number().int().min(0).optional(),
  max_age_days: z.number().int().min(1).max(30).optional(),
  delivery_format: z.enum(['digest', 'individual', 'archive']).optional(),
  is_active: z.boolean().optional(),
})

// Username validation helper
export const validateInstagramUsername = (username: string): boolean => {
  return /^[a-zA-Z0-9._]{1,30}$/.test(username)
}

// Project ID validation helper
export const validateProjectId = (id: number): boolean => {
  return Number.isInteger(id) && id > 0
}

// Subscription limits validation
export const validateSubscriptionLimits = {
  maxReels: (count: number) => count >= 1 && count <= 50,
  minViews: (count: number) => count >= 0,
  maxAgeDays: (days: number) => days >= 1 && days <= 30,
  deliveryFormat: (format: string) => ['digest', 'individual', 'archive'].includes(format),
}

// Rate limiting validation
export const validateRateLimit = {
  maxRequestsPerHour: 100,
  maxConcurrentTasks: 10,
  cacheTimeoutMs: 1000 * 60 * 60, // 1 hour
}

// Type exports for TypeScript
export type InstagramUserType = z.infer<typeof InstagramUserSchema>
export type ValidatedInstagramUserType = z.infer<typeof ValidatedInstagramUserSchema>
export type InstagramScrapingEventType = z.infer<typeof InstagramScrapingEventSchema>
export type RawInstagramReelType = z.infer<typeof RawInstagramReelSchema>
export type CreateSubscriptionType = z.infer<typeof CreateSubscriptionSchema>
export type UpdateSubscriptionType = z.infer<typeof UpdateSubscriptionSchema>