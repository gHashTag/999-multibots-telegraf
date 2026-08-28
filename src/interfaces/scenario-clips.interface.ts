/**
 * Scenario Clips Interface
 */

import { z } from 'zod'

export interface ScenarioClip {
  id: string
  title: string
  description: string
  duration: number
}

export interface GenerateScenarioClipsPayload {
  scenarioId: string
  userId: string
  clips: ScenarioClip[]
}

// Database record type for scenario_clips table
export interface ScenarioClipsRecord {
  id?: string
  project_id: string
  requester_telegram_id: string
  base_photo_url?: string
  base_prompt: string
  scene_count: number
  variants_per_scene: number
  aspect_ratio: string
  flux_model?: string
  status: string
  total_cost_stars?: number
  metadata?: Record<string, any>
  created_at?: Date | string
}

// Scene data type
export interface SceneData {
  scene_number: number
  scene_prompt: string
  theme: string
  variants: SceneVariant[]
}

// Scene variant type
export interface SceneVariant {
  variant_number: number
  prompt_used: string
  generation_time?: number | string
  metadata?: Record<string, any>
  image_url?: string
  flux_model?: string
}

// Report metadata type
export interface ScenarioReportMetadata {
  aspect_ratio: string
  base_prompt: string
  blogger_style?: string
  cost_breakdown?: any
  base_photo_url?: string
  generation_date: Date
  processing_time?: number
  style_info?: any
  total_scenes: number
  total_variants: number
  total_images?: number
  flux_model?: string
}

// Zod schema for input validation
export const generateScenarioClipsSchema = z.object({
  project_id: z.string().min(1),
  requester_telegram_id: z.string().min(1),
  prompt: z.string().min(1),
  photo_url: z.string().url().optional(),
  scene_count: z.number().int().min(1).max(20),
  variants_per_scene: z.number().int().min(1).max(5),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:5']),
  metadata: z.record(z.any()).optional(),
})
