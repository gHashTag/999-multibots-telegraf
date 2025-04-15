import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'
import { TelegramId } from '@/interfaces/telegram.interface'

// Configuration
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const API_URL = process.env.API_URL || 'http://localhost:3000'

/**
 * Types for model operations
 */
export interface ModelFile {
  filePath: string
  fileSize: number
  fileName: string
}

export interface ModelTrainingConfig {
  filePath: string
  triggerWord: string
  modelName: string
  steps: number
  telegram_id: TelegramId
  is_ru: boolean
  botName: string
}

export interface ModelUploadResult {
  success: boolean
  url?: string
  error?: string
}

/**
 * Generates a unique ID for model training request
 */
export const generateModelRequestId = (telegram_id: string, modelName: string): string => {
  return `train-${telegram_id}-${modelName}-${Date.now()}-${uuidv4().substring(0, 8)}`
}

/**
 * Validates model file existence and size
 */
export const validateModelFile = async (filePath: string): Promise<ModelFile> => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found: ' + filePath)
    }

    const fileStats = fs.statSync(filePath)
    const fileSize = fileStats.size
    const fileName = path.basename(filePath)

    logger.info({
      message: '📏 Checking model file',
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2) + ' MB',
      fileName,
    })

    return {
      filePath,
      fileSize,
      fileName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Error checking model file',
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath,
    })
    throw error
  }
}

/**
 * Uploads model file and returns access URL
 */
export const uploadModelFile = async (modelFile: ModelFile): Promise<ModelUploadResult> => {
  try {
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      await fs.promises.mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Copy file to uploads directory
    const destPath = path.join(UPLOAD_DIR, modelFile.fileName)
    await fs.promises.copyFile(modelFile.filePath, destPath)

    // Generate full URL
    const fullUrl = `${API_URL}/uploads/${modelFile.fileName}`

    logger.info({
      message: '✅ Model file saved and available at URL',
      path: destPath,
      url: fullUrl,
    })

    return {
      success: true,
      url: fullUrl,
    }
  } catch (error) {
    logger.error({
      message: '❌ Error uploading model file',
      error: error instanceof Error ? error.message : 'Unknown error',
      fileName: modelFile.fileName,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Cleans up temporary files after upload
 */
export const cleanupModelFiles = async (filePath: string): Promise<void> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
      logger.info({
        message: '🧹 Model temporary files cleaned up',
        filePath,
      })
    }
  } catch (error) {
    logger.warn({
      message: '⚠️ Error cleaning up model temporary files',
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath,
    })
  }
}

/**
 * Generates user messages in different languages
 */
export const getModelTrainingMessages = (is_ru: boolean) => ({
  started: is_ru
    ? '🔄 <b>Запрос на обучение модели отправлен!</b>\n\nЭто может занять несколько часов. Я отправлю уведомление, когда модель будет готова.'
    : '🔄 <b>Model training request sent!</b>\n\nThis may take several hours. I will send a notification when the model is ready.',
  
  error: (message: string) => is_ru
    ? `❌ <b>Ошибка при запуске тренировки:</b>\n\n${message}`
    : `❌ <b>Error while starting training:</b>\n\n${message}`,
    
  success: is_ru
    ? '✅ <b>Модель успешно отправлена на обучение!</b>'
    : '✅ <b>Model successfully sent for training!</b>'
})