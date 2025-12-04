/**
 * Scenario Clips Interface
 * Types for scenario generation functionality
 */

import { z } from 'zod'

/**
 * Schema for generating scenario clips
 */
export const generateScenarioClipsSchema = z.object({
  project_id: z.number().optional(),
  requester_telegram_id: z.string().optional(),
  photo_url: z.string().optional(),
  prompt: z.string().min(1, 'Prompt is required'),
  scene_count: z.number().min(1).max(20).default(5),
  variants_per_scene: z.number().min(1).max(10).default(3),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  blogger_style: z
    .enum(['TIKTOK', 'YOUTUBE', 'INSTAGRAM', 'LINKEDIN', 'BIBLE'])
    .default('YOUTUBE'),
  metadata: z.record(z.any()).optional(),
})

/**
 * Database record for scenario clips
 */
export interface ScenarioClipsRecord {
  id: number
  project_id?: number
  requester_telegram_id?: string
  base_photo_url?: string
  base_prompt: string
  scene_count: number
  variants_per_scene: number
  aspect_ratio: '16:9' | '9:16' | '1:1'
  flux_model: string
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  total_cost_stars: number
  created_at: Date
  updated_at?: Date
}

/**
 * Scene variant data
 */
export interface SceneVariant {
  variant_number: number
  prompt_used: string
  generation_time: number
  metadata?: {
    text_length?: number
    blogger_style?: string
    status?: string
    [key: string]: any
  }
}

/**
 * Scene data structure
 */
export interface SceneData {
  scene_number: number
  theme?: string
  scene_prompt: string
  variants: SceneVariant[]
}

/**
 * Scenario report metadata
 */
export interface ScenarioReportMetadata {
  project_id?: number
  requester_telegram_id?: string
  base_prompt: string
  scene_count: number
  variants_per_scene: number
  aspect_ratio: '16:9' | '9:16' | '1:1'
  total_cost_stars: number
  created_at: Date
  blogger_style?: string
  style_info?: any
}

