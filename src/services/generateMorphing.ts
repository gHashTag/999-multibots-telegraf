import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { SECRET_API_KEY, API_URL } from '@/config'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

interface MorphingRequest {
  filePath: string
  telegram_id: string
  is_ru: boolean
  botName: string
  imageCount: number
  morphingType: 'seamless' | 'loop' // seamless - плавные переходы, loop - замкнутый цикл
}

interface MorphingResponse {
  message: string
  video_url?: string
  job_id?: string
  status: 'processing' | 'completed' | 'error'
}

/**
 * Сервис для создания морфинга из архива изображений
 * Отправляет ZIP архив на бэкенд для обработки с помощью Kling-v1.6
 */
export async function generateMorphing(
  requestData: MorphingRequest,
  ctx: MyContext
): Promise<MorphingResponse> {
  try {
    logger.info('[Morphing Service] Starting morphing generation', {
      telegramId: requestData.telegram_id,
      imageCount: requestData.imageCount,
      morphingType: requestData.morphingType,
    })

    // Определяем endpoint для морфинга
    const url = `${API_URL}/generate/morph-images`

    // Проверяем, что файл существует
    if (!fs.existsSync(requestData.filePath)) {
      throw new Error('ZIP файл не найден: ' + requestData.filePath)
    }

    // Получаем размер файла для логирования
    const stats = fs.statSync(requestData.filePath)
    logger.info('[Morphing Service] ZIP file stats', {
      telegramId: requestData.telegram_id,
      filePath: requestData.filePath,
      fileSize: stats.size,
    })

    // Создаем FormData для передачи файла
    const formData = new FormData()
    formData.append('type', 'morphing')
    formData.append('telegram_id', requestData.telegram_id)
    formData.append('images_zip', fs.createReadStream(requestData.filePath))
    formData.append('image_count', requestData.imageCount.toString())
    formData.append('morphing_type', requestData.morphingType)
    formData.append('model', 'kling-v1.6-pro') // Используем Kling-v1.6 для морфинга
    formData.append('is_ru', requestData.is_ru.toString())
    formData.append('bot_name', requestData.botName)

    logger.info('[Morphing Service] Sending request to server', {
      telegramId: requestData.telegram_id,
      url,
      formDataKeys: Object.keys(formData.getBuffer ? formData : {}),
    })

    // Отправляем запрос на сервер
    const response: AxiosResponse<MorphingResponse> = await axios.post(
      url,
      formData,
      {
        headers: {
          'x-secret-key': SECRET_API_KEY,
          ...formData.getHeaders(),
        },
        timeout: 60000, // 60 секунд таймаут для загрузки
      }
    )

    logger.info('[Morphing Service] Server response received', {
      telegramId: requestData.telegram_id,
      status: response.status,
      responseData: response.data,
    })

    // Удаляем временный ZIP файл после успешной отправки
    try {
      await fs.promises.unlink(requestData.filePath)
      logger.info('[Morphing Service] Temporary ZIP file deleted', {
        telegramId: requestData.telegram_id,
        filePath: requestData.filePath,
      })
    } catch (unlinkError) {
      logger.warn('[Morphing Service] Failed to delete temporary ZIP file', {
        telegramId: requestData.telegram_id,
        filePath: requestData.filePath,
        error: unlinkError,
      })
    }

    return response.data
  } catch (error) {
    logger.error('[Morphing Service] Error during morphing generation', {
      telegramId: requestData.telegram_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (axios.isAxiosError(error)) {
      logger.error('[Morphing Service] API Error details', {
        telegramId: requestData.telegram_id,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      })

      throw new Error(
        requestData.is_ru
          ? 'Произошла ошибка при создании морфинга на сервере'
          : 'Server error occurred while creating morphing'
      )
    }

    throw error
  }
}
