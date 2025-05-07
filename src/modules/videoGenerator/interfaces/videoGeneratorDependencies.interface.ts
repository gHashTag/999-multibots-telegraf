import { UserType as User } from '@/interfaces/supabase.interface'
import { VideoModelConfig } from '../config/models.config' // Предполагаем, что конфиг будет там

// Типы для функций-хелперов (уточненные после анализа supabaseHelper.ts)
export type DownloadFileFn = (url: string) => Promise<Buffer>

// getUser будет возвращать полный объект User | null для гибкости,
// а использующая функция будет брать нужные поля (level, aspect_ratio)
export type GetUserFn = (telegramId: string) => Promise<User | null>

export type ProcessBalanceFn = (
  telegramId: string,
  modelId: string, // Соответствует modelId, используемому в processBalanceVideoOperationHelper
  isRu: boolean,
  botName: string // Используется в хелпере для формирования описания платежа
) => Promise<{
  success: boolean
  error?: string
  newBalance?: number
  paymentAmount?: number
}>

// saveVideoUrlHelper не принимает сложный объект и не возвращает ID
export type SaveVideoUrlFn = (
  telegramId: string,
  videoUrl: string,
  videoPath: string, // локальный путь, который будет storage_path
  modelId: string // используется как 'type' в таблице assets
) => Promise<void> // Возвращает void, выбрасывает ошибку при неудаче

// updateUserLevelHelper сам получает текущий уровень и инкрементирует его
export type UpdateUserLevelFn = (telegramId: string) => Promise<void>

// Логгер
export interface LoggerFn {
  (message: string, metadata?: Record<string, any>): void // Типичный интерфейс логгера
}

// Для файловой системы
export type MkdirFn = (
  path: string,
  options?: { recursive?: boolean }
) => Promise<string | undefined>
export type WriteFileFn = (path: string, data: Buffer) => Promise<void>
export type PathJoinFn = (...paths: string[]) => string
export type PathBasenameFn = (p: string, ext?: string) => string

// Для replicate.run (аналогично neuroPhoto, но учтем, что он может вернуть строку или массив строк)
interface ReplicateRunOutput {
  // Replicate может вернуть разные структуры, эта должна покрывать основные случаи
  // Либо это массив URL
  [index: number]: string
  // Либо это объект с полем output
  output?: string | string[]
  // Либо просто строка URL
  // string
}

export interface ReplicateRunMinimalResponse {
  id: string
  output: ReplicateRunOutput | string | string[] // Более гибкий тип для output
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  error?: any
  // ... другие поля, если они используются из ответа Replicate
}

export interface VideoGeneratorDependencies {
  replicateRun: (
    model: string,
    options: { input: any }
  ) => Promise<ReplicateRunMinimalResponse | string | string[]> // Уточнил тип возврата

  // Функции-хелперы (обновленные типы)
  downloadFile: DownloadFileFn
  getUser: GetUserFn
  processBalance: ProcessBalanceFn
  saveVideoUrl: SaveVideoUrlFn
  updateUserLevel: UpdateUserLevelFn

  // Конфигурация
  getVideoModelConfig: (modelId: string) => VideoModelConfig | undefined

  // Файловые операции
  mkdir: MkdirFn
  writeFile: WriteFileFn
  pathJoin: PathJoinFn
  pathBasename: PathBasenameFn

  // Утилиты
  generateUUID: () => string

  // Логгер
  logInfo: LoggerFn
  logError: LoggerFn
  logWarn: LoggerFn
}
