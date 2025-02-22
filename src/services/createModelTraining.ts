import axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { isDev, SECRET_API_KEY } from '@/config'

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
  requestData: ModelTrainingRequest
): Promise<ModelTrainingResponse> {
  try {
    // console.log('requestData', requestData)
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
    }/generate/create-model-training`

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

    await fs.promises.unlink(requestData.filePath)
    // console.log('Model training response:', response.data)
    return response.data
  } catch (error) {
    // if (axios.isAxiosError(error)) {
    //   console.error('API Error:', error.response?.data || error.message)
    //   throw new Error(
    //     requestData.is_ru
    //       ? 'Произошла ошибка при создании тренировки модели'
    //       : 'Error occurred while creating model training'
    //   )
    // }
    console.error('Unexpected error:', error)
    throw error
  }
}
