import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { MyContext } from '@/interfaces'

interface ModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: string
  is_ru: boolean
  steps: number
  botName: string
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
    console.log('createModelTraining requestData:', requestData)
    const mode = ctx.session.mode
    const gender = ctx.session.gender
    console.log('[createModelTraining] Mode:', mode)
    console.log('[createModelTraining] Gender from session:', gender)

    let url = ''
    if (mode === 'digital_avatar_body') {
      url = `${
        isDev ? LOCAL_SERVER_URL : API_SERVER_URL
      }/generate/create-model-training`
    } else {
      url = `${
        isDev ? LOCAL_SERVER_URL : API_SERVER_URL
      }/generate/create-model-training-v2`
    }

    console.log('[createModelTraining] Target URL:', url)

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

    // Add gender to the form data if it exists
    if (gender) {
      formData.append('gender', gender)
      console.log('[createModelTraining] Appending gender to FormData:', gender)
    } else {
      console.warn(
        '[createModelTraining] Gender not found in session when sending request.'
      )
      // Decide if we should send a default or nothing.
      // Sending nothing might be safer if the backend expects it optionally.
    }

    const response: AxiosResponse<ModelTrainingResponse> = await axios.post(
      url,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-secret-key': SECRET_API_KEY,
          ...formData.getHeaders(),
        },
      }
    )

    // Clean up the zip file after successful upload
    try {
      await fs.promises.unlink(requestData.filePath)
      console.log(
        `[createModelTraining] Deleted temp zip file: ${requestData.filePath}`
      )
    } catch (unlinkError) {
      console.error(
        `[createModelTraining] Error deleting temp zip file ${requestData.filePath}:`,
        unlinkError
      )
    }

    console.log('[createModelTraining] API Response:', response.data)
    return response.data
  } catch (error) {
    let errorMessage = 'Unexpected error during model training request'
    if (axios.isAxiosError(error)) {
      console.error(
        '[createModelTraining] Axios Error:',
        error.response?.status,
        error.response?.data || error.message
      )
      errorMessage = requestData.is_ru
        ? 'Произошла ошибка при отправке запроса на обучение модели'
        : 'Error occurred while sending model training request'
      // You might want to throw a more specific error or return a structured error
    } else {
      console.error('[createModelTraining] Unexpected error:', error)
    }
    // Rethrow or handle as needed. Rethrowing propagates the error.
    throw new Error(errorMessage)
  }
}
