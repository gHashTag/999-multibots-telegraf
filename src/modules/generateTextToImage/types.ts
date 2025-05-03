import type { SupabaseClient } from '@supabase/supabase-js'
import type { Telegraf } from 'telegraf'
import type { Logger as WinstonLogger } from 'winston'
import type Replicate from 'replicate'
import type { MyContext } from '@/interfaces'
import type { MinimalLogger } from '@/modules/localImageToVideo/types' // Reuse if suitable
import type { VideoModelConfig } from '@/price/models/VIDEO_MODELS_CONFIG'
import type { ModelInfo as ImageModelConfig } from '@/price/models/IMAGES_MODELS'

// Define a more specific type for the Supabase client if needed, or use SupabaseClient
type SupabaseDependency = SupabaseClient // Placeholder, refine as needed

// Define a more specific type for the Replicate client if needed
type ReplicateDependency = Replicate // Placeholder, refine as needed

// Define a type for file system operations needed
interface FileSystemOps {
  mkdir: (path: string, options?: any) => Promise<void>
  writeFile: (path: string, data: Buffer | string) => Promise<void>
}

// Define a type for the balance processing function (adjust parameters as needed)
type ProcessBalanceFunction = (
  ctx: MyContext,
  model: string,
  isRu: boolean
) => Promise<{
  success: boolean
  newBalance?: number // Made optional as it might not always be returned
  paymentAmount: number
  error?: string
}>

// Define a type for the internal video generation function
type GenerateVideoInternalFunction = (
  prompt: string,
  model: string,
  negativePrompt: string
) => Promise<string | string[]>

// Define types for error sending functions
type SendErrorToUserFunction = (
  botName: string,
  telegramId: string,
  error: Error,
  isRu: boolean
) => Promise<void>

type SendErrorToAdminFunction = (
  botName: string,
  telegramId: string,
  error: Error
) => Promise<void>

// Define type for the pulse helper function
type PulseHelperFunction = (
  path: string,
  prompt: string,
  type: string,
  telegramId: string,
  username: string,
  isRu: boolean,
  botName: string
) => Promise<void>

/**
 * Dependencies required by the generateTextToVideo service.
 */
export interface GenerateTextToVideoDependencies {
  logger: MinimalLogger // Using MinimalLogger for simplicity
  supabase: SupabaseDependency
  replicate: ReplicateDependency
  telegram: Telegraf<MyContext>['telegram']
  fs: FileSystemOps
  processBalance: ProcessBalanceFunction
  generateVideoInternal: GenerateVideoInternalFunction
  sendErrorToUser: SendErrorToUserFunction
  sendErrorToAdmin: SendErrorToAdminFunction
  pulseHelper: PulseHelperFunction
  // Configuration can be passed here if needed
  // videoModelsConfig: Record<string, VideoModelConfig>;
}

// --- Dependencies for generateTextToImage --- //

// Define a type for the function processing API response for images
type ProcessImageApiResponseFunction = (
  output: string | string[] | unknown
) => Promise<string> // Returns a single image URL

// Define type for saving image prompt
type SaveImagePromptFunction = (
  prompt: string,
  modelKey: string,
  imageLocalUrl: string,
  telegramId: number
) => Promise<number> // Returns prompt_id

// Define type for saving image file locally
type SaveImageLocallyFunction = (
  telegramId: string,
  imageUrl: string,
  subfolder: string,
  extension: string
) => Promise<string> // Returns local path

// Define type for getting user aspect ratio
type GetAspectRatioFunction = (telegramId: number) => Promise<string>

/**
 * Dependencies required by the generateTextToImage service.
 */
export interface GenerateTextToImageDependencies {
  logger: MinimalLogger
  supabase: SupabaseDependency // Assuming same Supabase client needed
  replicate: ReplicateDependency
  telegram: Telegraf<MyContext>['telegram']
  fsCreateReadStream: typeof import('fs').createReadStream // Need fs.createReadStream
  pathBasename: typeof import('path').basename // Need path.basename
  processBalance: ProcessBalanceFunction // Reusing the same type, might need adjustment
  processImageApiResponse: ProcessImageApiResponseFunction
  saveImagePrompt: SaveImagePromptFunction
  saveImageLocally: SaveImageLocallyFunction
  getAspectRatio: GetAspectRatioFunction
  // Error functions are likely the same
  sendErrorToUser: SendErrorToUserFunction
  sendErrorToAdmin: SendErrorToAdminFunction
  // Configuration for image models
  imageModelsConfig: Record<string, ImageModelConfig>
}
