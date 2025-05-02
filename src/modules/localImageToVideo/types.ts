/**
 * @packageDocumentation
 * Interfaces for the modular image-to-video generation service (Replicate-based).
 */

import { SupabaseClient as ActualSupabaseClient } from '@supabase/supabase-js'
import Replicate from 'replicate'
import { VIDEO_MODELS_CONFIG } from './VIDEO_MODELS_CONFIG' // Import LOCAL config for type derivation if needed elsewhere

/**
 * Request parameters for generating a video from an image.
 */
export interface ImageToVideoRequest {
  imageUrl: string
  prompt: string
  videoModel: keyof typeof VIDEO_MODELS_CONFIG // Use keys from LOCAL config
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
 * Interface for the file download function.
 * Downloads a file from a URL and returns its Buffer.
 */
export type DownloadFunction = (url: string) => Promise<Buffer>

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
