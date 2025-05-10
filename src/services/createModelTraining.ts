import axios, { AxiosError, AxiosResponse } from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import {
  isDev,
  SECRET_API_KEY,
  ELESTIO_URL,
  LOCAL_SERVER_URL,
  UPLOAD_DIR,
  API_URL,
} from '@/config'
import { MyContext } from '@/interfaces'
import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'

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

// Функция для кодирования файла в base64
async function encodeFileToBase64(filePath: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    return fileBuffer.toString('base64')
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при кодировании файла в base64',
      error: error.message,
      filePath,
    })
    throw error
  }
}

export async function createModelTraining(
  requestData: ModelTrainingRequest,
  ctx: MyContext
): Promise<ModelTrainingResponse> {
  try {
    logger.info({
      message: '🚀 Запуск тренировки модели через Inngest',
      requestData: {
        ...requestData,
        filePath: `${requestData.filePath.substring(0, 20)}...`, // Логируем только часть пути для безопасности
      },
    })

    // Проверяем, что файл существует
    if (!fs.existsSync(requestData.filePath)) {
      throw new Error('Файл не найден: ' + requestData.filePath)
    }

    // Кодируем файл в base64
    logger.info({
      message: '📦 Кодирование ZIP файла в base64',
      filePath: requestData.filePath,
    })

    const encodedZip = await encodeFileToBase64(requestData.filePath)

    logger.info({
      message: '✅ ZIP файл успешно закодирован',
      filePath: requestData.filePath,
      encodedLength: encodedZip.length,
    })

    logger.info({
      message: '🔗 Отправляем событие в Inngest',
      modelName: requestData.modelName,
      telegramId: requestData.telegram_id,
      encodedZip: encodedZip,
    })

    // Определяем имя события в зависимости от режима
    let eventName = 'model-training/start'
    const zipUrl = await uploadFileAndGetUrl(requestData.filePath)
    logger.info({
      message: '🔗 Отправляем событие в Inngest',
      modelName: requestData.modelName,
      telegramId: requestData.telegram_id,
      encodedZip: encodedZip,
      zipUrl: zipUrl,
    })

    // Для digital_avatar_body_2 используем другое событие
    if (ctx.session.mode === 'digital_avatar_body_2') {
      eventName = 'model-training/v2/requested'
    }

    // Отправляем событие в Inngest для асинхронной обработки
    const eventId = await inngest.send({
      name: eventName,
      data: {
        zipUrl,
        triggerWord: requestData.triggerWord,
        modelName: requestData.modelName,
        steps: requestData.steps,
        telegram_id: requestData.telegram_id,
        is_ru: requestData.is_ru,
        bot_name: requestData.botName,
      },
    })

    logger.info({
      message: '✅ Событие успешно отправлено в Inngest',
      eventId,
      telegram_id: requestData.telegram_id,
    })

    // Удаляем локальный файл после загрузки в хранилище
    await fs.promises.unlink(requestData.filePath)

    // Отправляем пользователю сообщение о начале процесса
    const isRu = requestData.is_ru === true
    await ctx.replyWithHTML(
      isRu
        ? '🔄 <b>Запрос на обучение модели отправлен!</b>\n\nЭто может занять несколько часов. Я отправлю уведомление, когда модель будет готова.'
        : '🔄 <b>Model training request sent!</b>\n\nThis may take several hours. I will send a notification when the model is ready.'
    )

    // Возвращаем ответ клиенту
    return {
      message: 'Запрос на обучение модели успешно отправлен.',
      bot_name: requestData.botName,
    }
  } catch (error) {
    logger.error({
      message: 'Ошибка при запуске тренировки модели',
      error: error.message,
      stack: error.stack,
      requestData: {
        modelName: requestData.modelName,
        telegram_id: requestData.telegram_id,
      },
    })

    // Отправляем пользователю информацию об ошибке
    const isRu = requestData.is_ru === true
    await ctx.replyWithHTML(
      isRu
        ? `❌ <b>Ошибка при запуске тренировки:</b>\n\n${error.message}`
        : `❌ <b>Error while starting training:</b>\n\n${error.message}`
    )

    throw error
  }
}

// Вспомогательная функция для загрузки файла и получения URL
async function uploadFileAndGetUrl(filePath: string): Promise<string> {
  try {
    // Проверяем размер файла
    const fileStats = fs.statSync(filePath)
    const fileSizeMB = fileStats.size / (1024 * 1024)

    logger.info({
      message: '📏 Размер файла для загрузки',
      fileSizeMB: fileSizeMB.toFixed(2) + ' МБ',
      fileSize: fileStats.size,
    })

    // Создаем структуру директорий для постоянного хранения
    const fileName = path.basename(filePath)
    const timestamp = Date.now()
    const permanentDir = path.join(UPLOAD_DIR, 'training_archives')

    // Создаем директорию, если её нет
    if (!fs.existsSync(permanentDir)) {
      fs.mkdirSync(permanentDir, { recursive: true })
    }

    // Добавляем timestamp к имени файла для уникальности
    const destFileName = `${path.parse(fileName).name}_${timestamp}${
      path.parse(fileName).ext
    }`
    const destPath = path.join(permanentDir, destFileName)

    // Копируем файл в постоянную директорию
    fs.copyFileSync(filePath, destPath)

    // Формируем полный URL с использованием API_URL
    const fullUrl = `${API_URL}/uploads/training_archives/${destFileName}`

    logger.info({
      message: '✅ Файл сохранен в постоянное хранилище и доступен по URL',
      path: destPath,
      fullUrl,
      urlLength: fullUrl.length,
    })

    return fullUrl
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при сохранении файла',
      error: error.message,
    })
    throw new Error(`Ошибка при сохранении файла: ${error.message}`)
  }
}
