import ReplicateInstance from 'replicate' // Тип для экземпляра Replicate
import { replicate } from '@/core/replicate' // Сам экземпляр клиента
import { UserType } from '@/interfaces/supabase.interface' // Импортируем UserType
import { PaymentType } from '@/interfaces/payments.interface'
import { MediaPulseOptions } from '@/helpers/pulse' // Убедитесь, что путь и экспорт корректны
import { ApiResponse } from '@/interfaces/api.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

export type User = UserType // Экспортируем User как псевдоним для UserType

// Определяем более конкретный тип для ответа replicate.run
// На основе того, что мы используем: id и output
export interface ReplicateRunMinimalResponse {
  id: string
  output: any // Тип output может быть разным, processApiResponse его обработает
  // Можно добавить другие поля при необходимости, например status
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  error?: any
}

// Типы для функций Supabase (уточните реальные типы или создайте обертки с этими сигнатурами)
export type GetUserByTelegramIdStringFn = (
  telegram_id: string
) => Promise<User | null>
export type UpdateUserLevelPlusOneFn = (
  telegram_id: string,
  currentLevel: number
) => Promise<void>
export type SavePromptDirectFn = (params: {
  prompt: string
  model_name: string // или model_url, должно соответствовать тому, что используется в savePromptDirect
  replicate_id: string // ID задачи Replicate
  image_urls: string[] // URL сгенерированных изображений
  telegram_id: number
  service_type: string // например, ModeEnum.NeuroPhoto
  additional_data?: Record<string, any>
  generation_time?: number // время генерации в мс
  prompt_id?: string // Если есть существующий ID промпта для обновления
}) => Promise<string | null> // Возвращает ID сохраненного промпта или null
export type GetAspectRatioFn = (telegram_id: number) => Promise<string | null>
export type GetLatestUserModelFn = (
  telegram_id: number,
  model_type_slug: string // например, 'bfl'
) => Promise<{
  model_url: string
  trigger_word: string
  finetune_id: string
  // ... другие необходимые поля модели
} | null>
export type GetUserDataFn = (telegram_id: string) => Promise<{
  gender?: 'male' | 'female' /*... другие поля пользователя ...*/
} | null>

// Типы для хелперов и бизнес-логики
export type CalculateModeCostFn = (params: {
  mode: ModeEnum
  steps?: number
}) => { stars: number | string /* ... другие поля стоимости ...*/ }
export type DirectPaymentProcessorFn = (params: {
  telegram_id: string
  amount: number
  type: PaymentType
  description: string
  bot_name: string
  service_type: ModeEnum
  inv_id: string
  bypass_payment_check?: boolean
  metadata?: Record<string, any>
}) => Promise<{ success: boolean; error?: string; payment_id?: string }>

export type SaveFileLocallyFn = (
  telegramId: string,
  imageUrl: string,
  subfolder: string,
  extension: string
) => Promise<string> // локальный путь
export type SendMediaToPulseFn = (options: MediaPulseOptions) => Promise<void>

// Логгер
export interface LoggerFn {
  (data: string | Record<string, any>): void
}

export interface NeuroPhotoServiceDependencies {
  replicateRun: (
    model: string,
    options: { input: any }
  ) => Promise<ReplicateRunMinimalResponse>
  getUserByTelegramIdString: GetUserByTelegramIdStringFn
  updateUserLevelPlusOne: UpdateUserLevelPlusOneFn
  savePromptDirect: SavePromptDirectFn
  getAspectRatio: GetAspectRatioFn
  getLatestUserModel: GetLatestUserModelFn
  getUserData: GetUserDataFn
  directPaymentProcessor: DirectPaymentProcessorFn
  calculateModeCost: CalculateModeCostFn
  saveFileLocally: SaveFileLocallyFn
  sendMediaToPulse: SendMediaToPulseFn
  generateUUID: () => string
  logInfo: LoggerFn
  logError: LoggerFn
  logWarn: LoggerFn
}

// New Result Types for NeuroPhoto Service
export interface NeuroPhotoSuccessItem {
  success: true
  imageUrl: string // URL от Replicate или другого источника
  localPath?: string // Локальный путь после скачивания
  s3Path?: string // Путь в S3, если загружено
  promptId?: string | null // ID связанного промпта в БД
  isNsfw?: boolean
  originalPrompt: string // Исходный промпт пользователя
  revisedPrompt?: string // Если промпт модифицировался (например, для V2 с trigger word)
  duration?: number // Время генерации конкретного изображения в секундах
  seed?: number | string // Seed, если доступен
  error?: null
  errorMessage?: null
  timestamp?: string // Добавляем timestamp
}

export interface NeuroPhotoErrorItem {
  success: false
  error: string // Ключ ошибки или общее сообщение
  errorMessage?: string // Более детальное сообщение об ошибке
  originalPrompt: string
  revisedPrompt?: string
  imageUrl?: null
  localPath?: null
  s3Path?: null
  promptId?: null
  isNsfw?: boolean // Может быть true, если NSFW стало причиной ошибки
  duration?: number
  seed?: number | string
  timestamp?: string // Добавляем timestamp
}

export type NeuroPhotoServiceResultItem =
  | NeuroPhotoSuccessItem
  | NeuroPhotoErrorItem

export interface NeuroPhotoOverallResult {
  status: 'success' | 'partial_success' | 'error' // Общий статус операции
  message?: string // Общее сообщение для пользователя
  results: NeuroPhotoServiceResultItem[] // Массив результатов для каждого запрошенного изображения
  cost?: number // Общая стоимость операции
  balanceAfter?: number // Баланс пользователя после списания (если применимо)
  paymentError?: string // Сообщение об ошибке платежа, если была
  totalProcessingTime?: number // Добавляем totalProcessingTime
}

// Parameters for V2 image generation request
export interface GenerateV2Params {
  basePrompt: string // Базовый промпт от пользователя
  numImages: number
  telegramId: string
  username?: string // Для логов и Pulse
  isRu: boolean
  botName: BotName
  bypassPaymentCheck?: boolean
  // Другие параметры, специфичные для V2, могут быть добавлены сюда,
  // но пока основная логика (trigger_word, gender, detailPrompt) будет внутри сервиса
}
