// src/modules/generateSpeech/types.ts
import type { WriteStream } from 'fs'
import type { InputFile } from 'telegraf/typings/core/types/typegram'
import type { Telegram } from 'telegraf' // Import Telegram type
import type { MyContext } from '@/interfaces' // Import MyContext if needed for Telegram methods
import type { User } from '@supabase/supabase-js'
import { ModeEnum } from '@/interfaces/modes'
import { BalanceOperationResult } from '@/interfaces/payments.interface'

// --- Interfaces for Dependencies ---

/**
 * Упрощенный интерфейс логгера для модуля.
 */
export interface MinimalLogger {
  info: (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
  warn: (message: string, ...meta: any[]) => void
}

/**
 * Интерфейс клиента ElevenLabs API.
 */
export interface ElevenLabsClient {
  generate: (options: {
    voice: string
    model_id: string
    text: string
  }) => Promise<NodeJS.ReadableStream> // Assuming it returns a readable stream
}

/**
 * Интерфейс для операций с файловой системой.
 */
export interface FileSystemOps {
  createWriteStream: (path: string) => WriteStream
}

/**
 * Интерфейс для работы с путями.
 */
export interface PathOps {
  join: (...paths: string[]) => string
}

/**
 * Интерфейс для работы с OS.
 */
export interface OsOps {
  tmpdir: () => string
}

/**
 * Интерфейс для функций Supabase.
 */
export interface SupabaseUserOps {
  getUserByTelegramIdString: (
    id: string
  ) => Promise<(User & { level: number }) | null>
  updateUserLevelPlusOne: (id: string, currentLevel: number) => Promise<any>
}

/**
 * Интерфейс для функций обработки ошибок.
 */
export interface ErrorHandlerOps {
  sendServiceErrorToUser: (
    botName: string,
    chatId: number | string,
    error: Error,
    isRu: boolean
  ) => Promise<void>
  sendServiceErrorToAdmin: (
    botName: string,
    userTelegramId: number | string,
    error: Error
  ) => Promise<void>
}

/**
 * Тип для функции расчета цены.
 */
export type PriceCalculatorFunction = (
  mode: ModeEnum,
  params?: any
) => { stars: number } | null // Simplified result

/**
 * Тип для функции обработки баланса.
 * Примечание: Убрана зависимость от `ctx`.
 */
export type BalanceProcessorFunction = (params: {
  telegram_id: number
  paymentAmount: number
  is_ru: boolean
  // Добавьте другие необходимые поля, если они требуются `processBalanceOperation`
  // например, botName? serviceType? metadata?
}) => Promise<BalanceOperationResult>

/**
 * Интерфейс для получения Telegram API.
 */
export interface TelegramApiProvider {
  getTelegramApi: (botName: string) => Promise<Telegram | null>
}

/**
 * Тип для хелпера toBotName.
 */
export type ToBotNameFunction = (
  botName: string | undefined
) => string | undefined

// --- Request and Response Types --- //

export interface GenerateSpeechRequest {
  text: string
  voice_id: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
}

export interface GenerateSpeechResponse {
  audioPath: string // Changed from audioUrl to reflect local path
}

// --- Dependency Injection Container --- //

/**
 * Зависимости, необходимые для модуля generateSpeech.
 */
export interface GenerateSpeechDependencies {
  logger: MinimalLogger
  elevenlabs: ElevenLabsClient
  fs: FileSystemOps
  path: PathOps
  os: OsOps
  supabase: SupabaseUserOps
  errorHandlers: ErrorHandlerOps
  priceCalculator: PriceCalculatorFunction
  balanceProcessor: BalanceProcessorFunction
  telegramApiProvider: TelegramApiProvider // Замена ctx.telegram
  helpers: {
    toBotName: ToBotNameFunction
  }
  elevenlabsApiKey: string
}
