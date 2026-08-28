/**
 * Instagram Schemas Stubs
 */

import { z } from 'zod'

export const InstagramReelSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  likes: z.number().default(0),
  comments: z.number().default(0),
  views: z.number().default(0),
})

export const CompetitorSchema = z.object({
  username: z.string(),
  followers: z.number(),
  engagement_rate: z.number(),
})
