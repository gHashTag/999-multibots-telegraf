/**
 * @packageDocumentation
 * Interfaces for the modular image-to-video generation service (Replicate-based).
 */

import { SupabaseClient as ActualSupabaseClient } from '@supabase/supabase-js'
import Replicate from 'replicate'
import {
  VideoModelConfig,
  VIDEO_MODELS_CONFIG,
} from '@/price/models/VIDEO_MODELS_CONFIG'
import { replicate } from '@/core/replicate'
import type { DownloadFunction } from './downloadFile'

/**
 * Request parameters for generating a video from an image.
 */
export interface ImageToVideoRequest {
  imageUrl: string
  prompt: string
  videoModel: keyof typeof VIDEO_MODELS_CONFIG
  metadata: {
    userId: string
    username: string
    botId: string
    aspectRatio?: string
  }
  locale: {
    language: 'ru' | 'en'
  }
}

/**
 * Response from the video generation service.
 */
export interface ImageToVideoResponse {
  success: boolean
  videoUrl: string // URL from Replicate
  message: string
  predictionId?: string // Optional ID from Replicate
}

/**
 * Interface for the Replicate client dependency.
 */
export type ReplicateClient = Replicate

/**
 * Logger interface.
 */
export interface MinimalLogger {
  info: (message: string, ...args: any[]) => void
  error: (message: string, ...args: any[]) => void
}

/**
 * Grouping **required** dependencies for the Replicate image-to-video service.
 */
export interface ImageToVideoDependencies {
  logger: MinimalLogger
  replicateClient?: ReplicateClient // Optional: falls back to global client
  downloadFile?: DownloadFunction // Optional: falls back to local helper
  // Removed unused dependencies: supabaseClient, modelsConfig, getBotByName, etc.
}
