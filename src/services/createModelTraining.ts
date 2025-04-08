import fs from 'fs'
import path from 'path'
import { UPLOAD_DIR, API_URL } from '@/config'
import { MyContext } from '@/interfaces'
import { inngest } from '@/inngest-functions/clients'
import { Logger as logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { TelegramId } from '@/interfaces/telegram.interface'
interface ModelTrainingRequest {
  filePath: string
  triggerWord: string
  modelName: string
  telegram_id: TelegramId
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

    // Загружаем zip-файл во временное файловое хранилище или CDN
    // и получаем URL для доступа к нему
    const zipUrl = await uploadFileAndGetUrl(requestData.filePath)

    logger.info({
      message: '🔗 Отправляем событие в Inngest без лишней нагрузки',
      modelName: requestData.modelName,
      telegramId: requestData.telegram_id,
      zipUrlLength: zipUrl.length,
    })

    // Определяем имя события в зависимости от режима
    let eventName = 'model-training/start'
    if (ctx.session.mode === ModeEnum.DigitalAvatarBodyV2) {
      eventName = 'model-training/v2/requested'
    }

    // Отправляем событие в Inngest для асинхронной обработки
    // Передаем только самое необходимое для уменьшения размера запроса
    const eventId = await inngest.send({
      id: `train:${requestData.telegram_id}:${
        requestData.modelName
      }:${uuidv4()}`,
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
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestData: {
        modelName: requestData.modelName,
        telegram_id: requestData.telegram_id,
      },
    })

    // Отправляем пользователю информацию об ошибке
    const isRu = requestData.is_ru === true
    await ctx.replyWithHTML(
      isRu
        ? `❌ <b>Ошибка при запуске тренировки:</b>\n\n${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        : `❌ <b>Error while starting training:</b>\n\n${
            error instanceof Error ? error.message : 'Unknown error'
          }`
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

    // Для всех файлов используем локальное сохранение
    // чтобы избежать проблем с Inngest и размером полезной нагрузки
    const fileName = path.basename(filePath)
    const destPath = path.join(UPLOAD_DIR, fileName)

    // Копируем файл в директорию uploads
    fs.copyFileSync(filePath, destPath)

    // Формируем полный URL с использованием API_URL вместо относительного пути
    const fullUrl = `${API_URL}/uploads/${fileName}`

    logger.info({
      message: '✅ Файл сохранен локально и доступен по URL',
      path: destPath,
      fullUrl,
      urlLength: fullUrl.length,
    })

    return fullUrl // Возвращаем полный URL для доступа к файлу
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при сохранении файла',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new Error(
      `Ошибка при сохранении файла: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}
