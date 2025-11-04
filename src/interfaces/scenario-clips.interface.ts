/**
 * Scenario Clips Interface
 * Интерфейсы для генерации сценариев и клипов
 */

import { z } from 'zod'

export interface ScenarioClip {
  id: string
  text: string
  duration: number
  clip_type: 'intro' | 'main' | 'outro' | 'transition'
  video_url?: string
  image_url?: string
}

export interface ScenarioRequest {
  topic: string
  style: string
  duration: number
  clips_count: number
  language?: 'ru' | 'en'
}

export interface ScenarioResponse {
  clips: ScenarioClip[]
  total_duration: number
  theme: string
}

export interface GenerateClipsEvent {
  topic: string
  style: string
  clips_count: number
  language?: 'ru' | 'en'
  user_id: string
}

export interface ClipGenerationResult {
  success: boolean
  clips: ScenarioClip[]
  error?: string
}

// Схемы для базы данных
export interface ScenarioClipsRecord {
  id: string
  user_id: string
  topic: string
  style: string
  clips_count: number
  language: 'ru' | 'en'
  created_at: string
  clips_json: any
}

export interface SceneData {
  text: string
  duration: number
  clip_type: 'intro' | 'main' | 'outro' | 'transition'
}

export interface SceneVariant {
  variant_id: string
  scenes: SceneData[]
  style_description: string
}

export interface ScenarioReportMetadata {
  total_duration: number
  total_clips: number
  theme: string
  style: string
}

// Zod схемы для валидации
export const generateScenarioClipsSchema = {
  parse: (data: any) => data,
}

export default {
  ScenarioClip,
  ScenarioRequest,
  ScenarioResponse,
  GenerateClipsEvent,
  ClipGenerationResult,
  ScenarioClipsRecord,
  SceneData,
  SceneVariant,
  ScenarioReportMetadata,
}
