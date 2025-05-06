import ReplicateInstance from 'replicate' // Тип для экземпляра Replicate
import { replicate } from '@/core/replicate' // Сам экземпляр клиента
import { UserType as User } from '@/interfaces/supabase.interface' // Используем UserType как User
import { PaymentType } from '@/interfaces/payments.interface'
import { MediaPulseOptions } from '@/helpers/pulse' // Убедитесь, что путь и экспорт корректны
import { ApiResponse } from '@/interfaces/api.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

// Определяем более конкретный тип для ответа replicate.run
// На основе того, что мы используем: id и output
interface ReplicateRunMinimalResponse {
  id: string
  output: any // Тип output может быть разным, processApiResponse его обработает
  // Можно добавить другие поля при необходимости, например status
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
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
export type ProcessApiResponseFn = (
  apiResponse: any,
  prompt?: string,
  logError?: LoggerFn
) => Promise<string[]> // Replicate может вернуть массив URL

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
  processApiResponse: ProcessApiResponseFn
  generateUUID: () => string
  logInfo: LoggerFn
  logError: LoggerFn
  logWarn: LoggerFn
}
