import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import fs from 'fs'
import path from 'path'
import { ensureDirectoryExistence } from '@/helpers'
import { sendBalanceMessage } from '@/price/helpers'
import { logger } from '@/utils/logger'
import {
  generateLipSync as generateLipSyncPlanB,
  LipSyncResponse,
  LipSyncError,
} from './plan_b/generateLipSync'
import { MyContext } from '@/interfaces'

export async function downloadFile(
  url: string,
  outputPath: string
): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream' })
  const writer = fs.createWriteStream(outputPath)

  return new Promise((resolve, reject) => {
    response.data.pipe(writer)
    let error: Error | null = null
    writer.on('error', err => {
      error = err
      writer.close()
      reject(err)
    })
    writer.on('close', () => {
      if (!error) {
        resolve()
      }
    })
  })
}

/**
 * Обертка для вызова функции генерации LipSync из Plan B.
 * Принимает URL видео и аудио, telegram_id и имя бота.
 * Возвращает результат от Plan B функции.
 */
export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegram_id: string,
  botName: string
): Promise<LipSyncResponse | LipSyncError> {
  logger.info('Перенаправление вызова generateLipSync на реализацию Plan B', {
    videoUrl,
    audioUrl,
    telegram_id,
    botName,
  })

  try {
    // Определяем язык на основе контекста или передаем по умолчанию
    // TODO: Получить язык из контекста или передать его как параметр
    const isRu = true // Placeholder - need to determine language properly

    const result = await generateLipSyncPlanB(
      telegram_id,
      videoUrl,
      audioUrl,
      isRu
    )

    // Логируем результат
    if ('message' in result) {
      // Error case
      logger.error('Ошибка при генерации LipSync (Plan B)', {
        error: result.message,
        telegram_id,
        videoUrl,
        audioUrl,
      })
    } else {
      // Success case
      logger.info('Успешный запуск генерации LipSync (Plan B)', {
        responseId: result.id,
        status: result.status,
        telegram_id,
      })
    }

    return result
  } catch (error) {
    logger.error('Неожиданная ошибка при вызове generateLipSyncPlanB', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      videoUrl,
      audioUrl,
    })
    // Возвращаем стандартизированный объект ошибки
    return {
      message:
        'Unexpected error occurred while calling Plan B lip sync generation',
    }
  }
}
