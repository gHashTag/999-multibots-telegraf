import fs from 'fs'
import AdmZip from 'adm-zip'
import axios from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'

interface MorphingRequest {
  filePath: string
  telegram_id: string
  is_ru: boolean
  botName: string
  imageCount: number
  morphingType: 'seamless' | 'loop'
}

interface MorphingResponse {
  message: string
  video_url?: string
  job_id?: string
  status: 'processing' | 'completed' | 'error'
}

/**
 * Сервис для создания морфинга - отправляет ZIP архив на отдельный API сервер
 */
export async function generateMorphing(
  requestData: MorphingRequest
): Promise<MorphingResponse> {
  console.log('🚨 [MORPHING SERVICE] ABOUT TO PROCESS ZIP:', {
    telegram_id: requestData.telegram_id,
    imageCount: requestData.imageCount,
    morphingType: requestData.morphingType,
    fileExists: fs.existsSync(requestData.filePath),
    fileSize: fs.statSync(requestData.filePath).size,
  })

  try {
    // URL для отправки запроса на отдельный API сервер
    const url = `${API_URL}/generate/morph-images`

    // Создаем FormData для отправки файла
    const FormData = require('form-data')
    const formData = new FormData()

    // Добавляем файл архива
    formData.append('images_zip', fs.createReadStream(requestData.filePath))

    // Добавляем остальные параметры
    formData.append('type', 'morphing')
    formData.append('telegram_id', requestData.telegram_id)
    formData.append('image_count', requestData.imageCount.toString())
    formData.append('morphing_type', requestData.morphingType)
    formData.append('model', 'kling-v1.6-pro')
    formData.append('is_ru', requestData.is_ru ? 'true' : 'false')
    formData.append('bot_name', requestData.botName)
    formData.append('username', 'telegram_bot')

    console.log('🚨 [MORPHING SERVICE] ABOUT TO SEND HTTP REQUEST:', {
      url,
      telegram_id: requestData.telegram_id,
      imageCount: requestData.imageCount,
      morphingType: requestData.morphingType,
      model: 'kling-v1.6-pro',
      fileExists: fs.existsSync(requestData.filePath),
      fileSize: fs.statSync(requestData.filePath).size,
      hasSecretKey: !!SECRET_API_KEY,
      secretKeyLength: SECRET_API_KEY?.length || 0,
    })

    // Отправляем запрос
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 30000, // 30 секунд таймаут
    })

    logger.info('[MORPHING SERVICE] Response received', {
      telegramId: requestData.telegram_id,
      status: response.status,
      data: response.data,
    })

    return {
      message: 'Морфинг поставлен в очередь для обработки',
      status: 'processing',
      job_id:
        response.data.job_id ||
        `morphing-${requestData.telegram_id}-${Date.now()}`,
    }
  } catch (error) {
    logger.error('[MORPHING SERVICE] Request failed', {
      telegramId: requestData.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    if (axios.isAxiosError(error)) {
      console.error('🚨 [MORPHING SERVICE] AXIOS ERROR DETAILS:', {
        telegramId: requestData.telegram_id,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
        code: error.code,
      })

      throw new Error(`Произошла ошибка при создании морфинга на сервере`)
    }

    throw new Error('Произошла ошибка при создании морфинга')
  }
}
