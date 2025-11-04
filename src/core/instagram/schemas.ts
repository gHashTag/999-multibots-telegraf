/**
 * Instagram Schemas
 * Заглушки для схем валидации Instagram
 */

import { z } from 'zod'

// Базовая схема для события скрапинга
export const InstagramScrapingEventSchema = z.object({
  username: z.string(),
  count: z.number().default(10),
  include_reels: z.boolean().default(false),
})

export type InstagramScrapingEvent = z.infer<typeof InstagramScrapingEventSchema>

// Схема для пользователя Instagram
export const ValidatedInstagramUserSchema = z.object({
  username: z.string(),
  followers_count: z.number(),
  following_count: z.number(),
  media_count: z.number(),
  profile_pic_url: z.string().optional(),
  is_verified: z.boolean().optional(),
})

export type ValidatedInstagramUser = z.infer<typeof ValidatedInstagramUserSchema>

// Валидация ответа API
export function validateInstagramApiResponse(data: any) {
  return {
    users: data.users || [],
    success: true,
  }
}

// Валидация списка пользователей
export function validateInstagramUsers(users: any[]): ValidatedInstagramUser[] {
  return users.map(user => ({
    username: user.username || '',
    followers_count: user.followers_count || 0,
    following_count: user.following_count || 0,
    media_count: user.media_count || 0,
    profile_pic_url: user.profile_pic_url,
    is_verified: user.is_verified || false,
  }))
}

// Схема для сохранения в базу данных
export const DatabaseSaveResultSchema = z.object({
  success: z.boolean(),
  saved: z.number(),
  duplicates: z.number(),
})

export type DatabaseSaveResult = z.infer<typeof DatabaseSaveResultSchema>

// Схемы для reels
export const ValidatedInstagramReelSchema = z.object({
  shortcode: z.string(),
  caption: z.string(),
  like_count: z.number(),
  comment_count: z.number(),
  view_count: z.number().optional(),
  posted_at: z.string(),
  media_url: z.string(),
})

export type ValidatedInstagramReel = z.infer<typeof ValidatedInstagramReelSchema>

export function validateInstagramReelsApiResponse(data: any) {
  return {
    reels: data.reels || [],
    success: true,
  }
}

export function validateInstagramReels(reels: any[]): ValidatedInstagramReel[] {
  return reels.map(reel => ({
    shortcode: reel.shortcode || '',
    caption: reel.caption || '',
    like_count: reel.like_count || 0,
    comment_count: reel.comment_count || 0,
    view_count: reel.view_count,
    posted_at: reel.posted_at || new Date().toISOString(),
    media_url: reel.media_url || '',
  }))
}

export const ReelsSaveResultSchema = z.object({
  success: z.boolean(),
  saved: z.number(),
})

export type ReelsSaveResult = z.infer<typeof ReelsSaveResultSchema>

// Схемы для создания пользователей
export const CreateInstagramUserEventSchema = z.object({
  username: z.string(),
  telegram_id: z.string(),
  bot_name: z.string(),
})

export type CreateInstagramUserEvent = z.infer<typeof CreateInstagramUserEventSchema>

export const CreateUserResultSchema = z.object({
  success: z.boolean(),
  user_id: z.string(),
})

export type CreateUserResult = z.infer<typeof CreateUserResultSchema>

export default {
  InstagramScrapingEventSchema,
  ValidatedInstagramUserSchema,
  DatabaseSaveResultSchema,
  ValidatedInstagramReelSchema,
  ReelsSaveResultSchema,
  CreateInstagramUserEventSchema,
  CreateUserResultSchema,
  validateInstagramApiResponse,
  validateInstagramUsers,
  validateInstagramReelsApiResponse,
  validateInstagramReels,
}
