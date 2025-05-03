import type { SupabaseClient } from '@supabase/supabase-js'
import type { Telegraf } from 'telegraf'
import type Replicate from 'replicate'
import type { MyContext } from '@/interfaces'
import type { MinimalLogger } from '@/modules/localImageToVideo/types' // Reuse if suitable
import type { VideoModelConfig } from '@/price/models/VIDEO_MODELS_CONFIG' // Import config type

// Тип для операций с файловой системой
interface FileSystemOps {
  mkdir: (path: string, options?: any) => Promise<void>
  writeFile: (path: string, data: Buffer | string) => Promise<void> // Keep writeFile for now
}

// Тип для функции обработки баланса (можно уточнить, если будет отдельная для видео)
type ProcessBalanceFunction = (
  ctx: MyContext,
  model: string,
  isRu: boolean
) => Promise<{
  success: boolean
  newBalance?: number
  paymentAmount: number
  error?: string
}>

// Тип для внутренней функции генерации видео
type GenerateVideoInternalFunction = (
  prompt: string,
  model: string, // Replicate model string like 'minimax/video-01'
  negativePrompt: string
) => Promise<string | string[]> // Returns URL(s)

// Типы для функций отправки ошибок
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

// Тип для pulse хелпера
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
 * Зависимости, необходимые для модуля generateTextToVideo.
 */
export interface GenerateTextToVideoDependencies {
  logger: MinimalLogger
  supabase: SupabaseClient
  replicate: Replicate // Несмотря на то что не используется напрямую, нужен для generateVideoInternal
  telegram: Telegraf<MyContext>['telegram']
  fs: FileSystemOps
  processBalance: ProcessBalanceFunction
  generateVideoInternal: GenerateVideoInternalFunction
  sendErrorToUser: SendErrorToUserFunction
  sendErrorToAdmin: SendErrorToAdminFunction
  pulseHelper: PulseHelperFunction
  videoModelsConfig: Record<string, VideoModelConfig> // Передаем конфиг через DI
  pathJoin: (...paths: string[]) => string // Передаем path.join
  pathDirname: (p: string) => string // Передаем path.dirname
  toBotName: (botName: string | undefined) => string | undefined // Передаем toBotName
}
