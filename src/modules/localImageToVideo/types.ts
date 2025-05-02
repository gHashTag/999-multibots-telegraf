/**
 * @packageDocumentation
 * Interfaces for the modular image-to-video generation service (local processing).
 */

import { VideoModelKey } from '@/interfaces/cost.interface' // Verify this path is correct
import { VIDEO_MODELS_CONFIG } from '@/config/models.config' // Verify this path is correct
import { SupabaseClient as ActualSupabaseClient } from '@supabase/supabase-js' // Assuming actual client type
import Replicate from 'replicate' // Assuming actual Replicate type

/**
 * Request parameters for generating a video from an image.
 */
export interface ImageToVideoRequest {
  imageUrl: string
  prompt: string
  videoModel: string // Key like 'minimax', 'haiper'
  metadata: {
    userId: string // Generic user ID
    username: string
    botId: string // Bot identifier is now required for context
    aspectRatio?: string // User's preferred aspect ratio
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
  videoUrl: string // LOCAL file path to the generated video
  message: string
  predictionId?: string // Optional ID from the generation service (e.g., Replicate)
}

/**
 * Interface for the Replicate client dependency.
 */
export type ReplicateClient = Replicate // Use the actual Replicate type

/**
 * Interface for the Supabase client dependency.
 */
export type SupabaseClient = ActualSupabaseClient // Use the actual Supabase type

/**
 * Interface for the file download function.
 * Downloads a file from a URL and returns its Buffer.
 */
export type DownloadFunction = (url: string) => Promise<Buffer>

/**
 * Interface for the file system operations dependency.
 */
export interface FileSystemOps {
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<string | undefined>
  writeFile: (path: string, data: Buffer) => Promise<void>
}

/**
 * Interface for a simplified Telegraf bot instance.
 */
export interface BotClient {
  telegram: {
    sendMessage: (
      chatId: string | number,
      text: string,
      extra?: any
    ) => Promise<any>
    sendVideo: (
      chatId: string | number,
      video: any,
      extra?: any
    ) => Promise<any>
  }
  botInfo?: {
    username?: string
  }
}

/**
 * Interface for the function to get a bot instance by name.
 */
export type GetBotFunction = (name: string) => { bot?: BotClient }

/**
 * Interface for the balance processing function.
 * Dependencies required by this function should be passed within it or via its own DI.
 */
// Use 'any' for MyContext if the actual type isn't readily available/importable
type MyContext = any

export type ProcessBalanceFunction = (
  ctx: MyContext, // Updated signature based on error
  configKey: keyof typeof VIDEO_MODELS_CONFIG, // Updated signature
  isRu: boolean
) => Promise<{ newBalance: number; paymentAmount: number }>

/**
 * Interface for the user level update function.
 */
export type UpdateUserLevelFunction = (
  userId: string,
  currentLevel: number
) => Promise<void>

/**
 * Interface for getting user data.
 */
export type GetUserFunction = (
  userId: string
) => Promise<{ level: number; aspectRatio?: string } | null>

/**
 * Interface for saving video URL/path to Supabase.
 */
export type SaveVideoFunction = (
  userId: string,
  originalUrl: string,
  localPath: string,
  model: string
) => Promise<void>

/**
 * Interface for notifying admin about errors.
 */
export type NotifyAdminFunction = (
  bot: BotClient,
  userId: string,
  error: Error
) => Promise<void>

/**
 * Logger interface.
 */
export interface MinimalLogger {
  info: (message: string, ...args: any[]) => void
  error: (message: string, ...args: any[]) => void
}

/**
 * Configuration for temporary file storage.
 */
export interface TmpStorageConfig {
  basePath: string // e.g., 'uploads' or '/tmp/uploads'
}

/**
 * Grouping all dependencies for the image-to-video service.
 */
export interface ImageToVideoDependencies {
  replicateClient?: ReplicateClient // Made optional, service can use global client
  supabaseClient: SupabaseClient // Keep for adapter/potential future use
  downloadFile?: DownloadFunction // Made optional, service can use local helper
  // fsOps: FileSystemOps; // Removed - not needed for Replicate flow
  logger: MinimalLogger
  modelsConfig: typeof VIDEO_MODELS_CONFIG // Keep for adapter/potential future use
  getBotByName: GetBotFunction // Keep for adapter/potential future use
  processBalanceVideoOperation: ProcessBalanceFunction // Keep for adapter/potential future use
  updateUserLevelPlusOne: UpdateUserLevelFunction // Keep for adapter/potential future use
  getUserByTelegramIdString: GetUserFunction // Keep for adapter/potential future use
  saveVideoUrlToSupabase: SaveVideoFunction // Keep for adapter/potential future use
  sendServiceErrorToAdmin: NotifyAdminFunction // Keep for adapter/potential future use
  // tmpStorageConfig: TmpStorageConfig; // Removed - not needed for Replicate flow
}

// Removed duplicated MinimalLogger and MinimalHttpClient
