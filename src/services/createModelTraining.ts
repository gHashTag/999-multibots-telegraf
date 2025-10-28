import axios, { AxiosResponse } from 'axios'
import { logger } from '@/utils/enhancedLogger'
import FormData from 'form-data'
import fs from 'fs'
import { SECRET_API_KEY, LOCAL_SERVER_URL, API_URL } from '@/config'
import { MyContext } from '@/interfaces'
interface ModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: string
  is_ru: boolean
  steps: number
  botName: string
  gender: string
}

interface ModelTrainingResponse {
  message: string
  model_id?: string
  bot_name?: string
}

export async function createModelTraining(
  requestData: ModelTrainingRequest,
  ctx: MyContext
): Promise<ModelTrainingResponse> {
  try {
    logger.debug('requestData', requestData)
    const mode = ctx.session.mode
    logger.debug('mode', mode)
    let url = ''
    if (mode === 'digital_avatar_body') {
      url = `${API_URL}/generate/create-model-training`
    } else {
      url = `${API_URL}/generate/create-model-training-v2`
    }

    // Проверяем, что файл существует
    if (!fs.existsSync(requestData.filePath)) {
      throw new Error('Файл не найден: ' + requestData.filePath)
    }

    // Создаем FormData для передачи файла
    const formData = new FormData()
    formData.append('type', 'model')
    formData.append('telegram_id', requestData.telegram_id)
    formData.append('zipUrl', fs.createReadStream(requestData.filePath))
    formData.append('triggerWord', requestData.triggerWord)
    formData.append('modelName', requestData.modelName)
    formData.append('steps', requestData.steps.toString())

    formData.append('is_ru', requestData.is_ru.toString())
    formData.append('bot_name', requestData.botName)
    formData.append('gender', requestData.gender)
    // Добавляем hardware параметр для исправления ошибки с устаревшим gpu-t4
    formData.append('hardware', 'gpu-a100-large')

    const response: AxiosResponse<ModelTrainingResponse> = await axios.post(
      url,
      formData,
      {
        headers: {
          'x-secret-key': SECRET_API_KEY,
          ...formData.getHeaders(),
        },
        // Увеличиваем таймаут для загрузки больших файлов
        timeout: 300000, // 5 минут
        // Ограничиваем размер ответа, чтобы избежать переполнения буфера
        maxContentLength: 50 * 1024 * 1024, // 50MB
        maxBodyLength: 100 * 1024 * 1024, // 100MB для загрузки файлов
      }
    )

    await fs.promises.unlink(requestData.filePath)
    // Логируем только основные данные, не весь объект ответа
    logger.debug('Model training response:', {
      message: response.data.message,
      model_id: response.data.model_id,
      bot_name: response.data.bot_name,
      status: response.status,
    })
    return response.data
  } catch (error) {
    // if (axios.isAxiosError(error)) {
    //   logger.error('API Error:', error.response?.data || error.message)
    //   throw new Error(
    //     requestData.is_ru
    //       ? 'Произошла ошибка при создании тренировки модели'
    //       : 'Error occurred while creating model training'
    //   )
    // }
    logger.error('Unexpected error:', error)
    throw error
  }
}
