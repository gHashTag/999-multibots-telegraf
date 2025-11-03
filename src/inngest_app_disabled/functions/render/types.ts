/**
 * TypeScript types for Render Inngest functions
 * Ported from Python render-api-v2 project
 */

// ========================
// Event Data Types
// ========================

/**
 * Event data for render workflow (from Python render.py)
 * Required fields:
 * - job_id: Unique job identifier
 * - template_url: URL to download template.aep
 * - job_json_url: URL to download job.json parameters
 * - composition_name: Name of the composition to render
 * - render_type: Type of render (create or update)
 * - server_url: Render server hostname
 * - server_port: SSH port
 * - server_user: SSH username
 * Optional:
 * - callback_url: URL to send completion callback
 */
export interface RenderEventData {
  job_id: string
  template_url: string
  job_json_url: string
  composition_name: string
  render_type: 'create' | 'update'
  server_url: string
  server_port: number
  server_user: string
  callback_url?: string
}

export interface ContentPlan {
  header: string
  speech: string
  tags: string
}

export interface RenderContentPlanEventData {
  user_id: string
  job_id?: string
  template_id: string
  content_plan: ContentPlan
  avatar_id: string
  voice_id: string
  heygen_api_key: string
  heygen_key_id?: string
  broll_idea_ids?: string[]
  broll_video_ids?: string[]
}

// ========================
// Job Types
// ========================

export interface JobLayerData {
  layer_id: string
  footage_id?: string
  composition: string
  name: string
  layer_type: 'video' | 'photo' | 'audio' | 'data'
  required: boolean
  data?: {
    start_time?: number
    in_point?: number
    out_point?: number
    [key: string]: any
  }
}

export interface JobResponse {
  id: string
  template_id: string
  user_id: string
  status: 'queued' | 'rendering' | 'completed' | 'failed'
  render_status?: string
  server_id?: string
  result_object_key?: string
  created_at: string
  updated_at?: string
  layers?: JobLayerData[]
  download_assets_progress?: number
  render_progress?: number
  upload_result_progress?: number
}

export interface CreateJobRequest {
  template_id: string
  user_id: string
}

export interface UpdateJobStatusRequest {
  status?: 'queued' | 'rendering' | 'completed' | 'failed'
  render_status?: string
  result_object_key?: string
}

export interface UpdateProgressRequest {
  download_assets_progress?: number
  render_progress?: number
  upload_result_progress?: number
}

export interface UpdateJobLayerRequest {
  layers: JobLayerData[]
}

export interface AssetUploadInfo {
  object_key: string
  remote_path: string
  layer_name?: string
  asset_type: 'template' | 'script' | 'video' | 'audio' | 'photo'
}

// ========================
// Server Types
// ========================

export interface RenderServer {
  id: string
  url: string
  port: number
  user: string
  status: 'active' | 'busy' | 'offline'
  created_at: string
}

// ========================
// Content Plan Types
// ========================

export interface ContentPlanCreate {
  job_id: string
  header: string
  speech: string
  tags: string
}

export interface ContentPlanResponse {
  id: string
  job_id: string
  header: string
  speech: string
  tags: string
  created_at: string
}

// ========================
// Avatar Video Types
// ========================

export interface HeyGenKeyWithId {
  id: string
  api_key: string
}

export interface AvatarVideoRequest {
  content_plan: ContentPlan
  avatar_id: string
  voice_id: string
  dimension_width: number
  dimension_height: number
}

export interface AvatarVideoResponse {
  id: string
  job_id: string
  video_id: string
  status: 'processing' | 'completed' | 'failed'
  heygen_api_key_id: string
  error_message?: string
}

export interface VideoStatusResponse {
  status: 'processing' | 'completed' | 'failed'
  error_message?: string
}

// ========================
// B-Roll Types
// ========================

export interface BRollIdeaRequest {
  header: string
  speech: string
  tags: string
}

export interface BRollIdeaResponse {
  ideas: string[]
}

export interface VideoGenerationRequest {
  broll_id: string
  seeds: number
  aspect_ratio: string
  model: string
}

export interface BRollVideoResponse {
  video_id: string
  task_id: string
  broll_id: string
  status: 'processing' | 'success' | 'failed'
}

// ========================
// S3 Types
// ========================

export interface PresignedUrlResponse {
  url: string
  object_key: string
  content_type: string
}

// ========================
// Footage Types
// ========================

export interface FootageResponse {
  id: string
  object_key: string
  footage_type: 'video' | 'photo' | 'audio'
  tags: string[]
}

export interface FilterFootagesByTagsRequest {
  tags: string[]
  match_all: boolean
  footage_type?: 'video' | 'photo' | 'audio'
  limit?: number
}

export interface FootageListResponse {
  footages: FootageResponse[]
  total: number
}

// ========================
// New Types from render-api-v3
// ========================

/**
 * Avatar generation settings (Hedra or HeyGen)
 */
export interface AvatarSettings {
  avatar_speech: string
  voice_id?: string
  avatar_photo_url?: string // For Hedra
  avatar_id?: string // For HeyGen
  api_key: string
}

/**
 * Text layer settings for riddle rendering
 */
export interface TextSettings {
  text: string
  position: [number, number, number]
  font_size: number
}

/**
 * Event data for render-avatar-video workflow
 */
export interface RenderAvatarVideoEventData {
  job_id?: string
  user_id: string
  kie_api_key: string
  eleven_labs_api_key: string
  avatar_gen_service: 'hedra' | 'heygen'
  avatar_settings: AvatarSettings
}

/**
 * Event data for render-riddle workflow
 */
export interface RenderRiddleEventData {
  job_id: string
  kie_api_key: string
  eleven_labs_api_key: string
  heygen_api_key?: string // Required when avatar_gen_service = 'heygen'
  avatar_gen_service: 'hedra' | 'heygen'
  avatar_settings: AvatarSettings
  cover_url: string
  intro_text_1: TextSettings
  intro_text_2: TextSettings
  circle_position: [number, number, number]
  circle_scale: [number, number, number]
  callback_url?: string
}
