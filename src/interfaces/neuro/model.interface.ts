import { type MyContext } from '../telegram-bot.interface'

export interface ModelTrainingConfig {
  modelName: string
  telegram_id: string
  triggerWord: string
  steps: number
  botName: string
  is_ru: boolean
}

export interface ModelTrainingRequest {
  modelName: string
  modelFile: string
  telegramId: string
  _test?: {
    inngest_error?: boolean
  }
}

export interface ModelTrainingDirectResult {
  success: boolean
  error?: string
  model_id?: string
}

export interface ModelFile {
  path: string
  size: number
  exists: boolean
}

export interface ModelUploadResult {
  success: boolean
  url?: string
  error?: string
}
