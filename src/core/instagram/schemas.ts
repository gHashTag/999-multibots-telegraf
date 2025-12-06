/**
 * Instagram Scraping Schemas
 * Zod validation schemas for Instagram scraping functionality
 */

import { z } from 'zod'

/**
 * Instagram Scraping Event Schema
 */
export const InstagramScrapingEventSchema = z.object({
  username_or_id: z.string().min(1, 'Username or ID is required'),
  project_id: z.number().positive('Project ID must be positive'),
  max_users: z.number().min(1).max(100).default(50),
  max_reels_per_user: z.number().min(1).max(100).default(50),
  scrape_reels: z.boolean().default(false),
  requester_telegram_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

export type InstagramScrapingEvent = z.infer<typeof InstagramScrapingEventSchema>

/**
 * Validated Instagram User
 */
export interface ValidatedInstagramUser {
  username: string
  pk: string
  full_name?: string
  biography?: string
  follower_count?: number
  following_count?: number
  media_count?: number
  profile_pic_url?: string
  is_verified?: boolean
  is_private?: boolean
  category?: string
}

/**
 * Validated Instagram Reel
 */
export interface ValidatedInstagramReel {
  id: string
  shortcode: string
  caption?: string
  like_count?: number
  comment_count?: number
  play_count?: number
  taken_at_timestamp?: number
  video_url?: string
  thumbnail_url?: string
}

/**
 * Database Save Result
 */
export interface DatabaseSaveResult {
  saved: number
  duplicates: number
  totalProcessed: number
}

/**
 * Reels Save Result
 */
export interface ReelsSaveResult {
  saved: number
  duplicates: number
  totalProcessed: number
}

/**
 * Validation functions
 */
export function validateInstagramApiResponse(data: any): ValidatedInstagramUser[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.map((user: any) => ({
    username: user.username || '',
    pk: user.pk || user.id || '',
    full_name: user.full_name,
    biography: user.biography,
    follower_count: user.follower_count || user.followerCount,
    following_count: user.following_count || user.followingCount,
    media_count: user.media_count || user.mediaCount,
    profile_pic_url: user.profile_pic_url || user.profilePicUrl,
    is_verified: user.is_verified || user.isVerified,
    is_private: user.is_private || user.isPrivate,
    category: user.category,
  }))
}

export function validateInstagramUsers(users: any[]): ValidatedInstagramUser[] {
  return validateInstagramApiResponse(users)
}

export function validateInstagramReelsApiResponse(data: any): ValidatedInstagramReel[] {
  if (!data?.items || !Array.isArray(data.items)) {
    return []
  }
  return data.items.map((reel: any) => ({
    id: reel.id || reel.pk || '',
    shortcode: reel.shortcode || '',
    caption: reel.caption?.text || reel.caption,
    like_count: reel.like_count || reel.likeCount,
    comment_count: reel.comment_count || reel.commentCount,
    play_count: reel.play_count || reel.playCount || reel.view_count || reel.viewCount,
    taken_at_timestamp: reel.taken_at_timestamp || reel.takenAtTimestamp,
    video_url: reel.video_url || reel.videoUrl,
    thumbnail_url: reel.thumbnail_url || reel.thumbnailUrl,
  }))
}

export function validateInstagramReels(reels: any[]): ValidatedInstagramReel[] {
  return validateInstagramReelsApiResponse({ items: reels })
}

/**
 * Database Save Result Schema
 */
export const DatabaseSaveResultSchema = z.object({
  saved: z.number(),
  duplicates: z.number(),
  totalProcessed: z.number(),
})

/**
 * Reels Save Result Schema
 */
export const ReelsSaveResultSchema = z.object({
  saved: z.number(),
  duplicates: z.number(),
  totalProcessed: z.number(),
})

/**
 * Create Instagram User Event Schema
 */
export const CreateInstagramUserEventSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  pk: z.string().min(1, 'PK is required'),
  project_id: z.number().positive('Project ID must be positive'),
  requester_telegram_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

export type CreateInstagramUserEvent = z.infer<typeof CreateInstagramUserEventSchema>

/**
 * Create User Result
 */
export interface CreateUserResult {
  success: boolean
  userId?: string
  error?: string
}

/**
 * Create User Result Schema
 */
export const CreateUserResultSchema = z.object({
  success: z.boolean(),
  userId: z.string().optional(),
  error: z.string().optional(),
})




