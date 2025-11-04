/**
 * Scenario Clips Interface
 * Интерфейсы для генерации сценариев и клипов
 */

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

export default {
  ScenarioClip,
  ScenarioRequest,
  ScenarioResponse,
  GenerateClipsEvent,
  ClipGenerationResult,
}
