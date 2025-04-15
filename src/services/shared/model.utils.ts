import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { UPLOAD_DIR, API_URL } from '@/config'
import { logger } from '@/utils/logger'
import { TelegramId } from '@/interfaces/telegram.interface'

/**
 * Типы для работы с моделями
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
 * Генерирует уникальный ID для запроса на обучение модели
 */
export const generateModelRequestId = (telegram_id: string, modelName: string): string => {
  return `train-${telegram_id}-${modelName}-${Date.now()}-${uuidv4().substring(0, 8)}`
}

/**
 * Проверяет существование файла и его размер
 */
export const validateModelFile = async (filePath: string): Promise<ModelFile> => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('Файл не найден: ' + filePath)
    }

    const fileStats = fs.statSync(filePath)
    const fileSize = fileStats.size
    const fileName = path.basename(filePath)

    logger.info({
      message: '📏 Проверка файла модели',
      fileSizeMB: (fileSize / (1024 * 1024)).toFixed(2) + ' МБ',
      fileName,
    })

    return {
      filePath,
      fileSize,
      fileName,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при проверке файла модели',
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath,
    })
    throw error
  }
}

/**
 * Загружает файл модели и возвращает URL для доступа
 */
export const uploadModelFile = async (modelFile: ModelFile): Promise<ModelUploadResult> => {
  try {
    // Копируем файл в директорию uploads
    const destPath = path.join(UPLOAD_DIR, modelFile.fileName)
    await fs.promises.copyFile(modelFile.filePath, destPath)

    // Формируем полный URL
    const fullUrl = `${API_URL}/uploads/${modelFile.fileName}`

    logger.info({
      message: '✅ Файл модели сохранен и доступен по URL',
      path: destPath,
      url: fullUrl,
    })

    return {
      success: true,
      url: fullUrl,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при загрузке файла модели',
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
 * Очищает временные файлы после загрузки
 */
export const cleanupModelFiles = async (filePath: string): Promise<void> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
      logger.info({
        message: '🧹 Временные файлы модели очищены',
        filePath,
      })
    }
  } catch (error) {
    logger.warn({
      message: '⚠️ Ошибка при очистке временных файлов модели',
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath,
    })
  }
}

/**
 * Формирует сообщения для пользователя на разных языках
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