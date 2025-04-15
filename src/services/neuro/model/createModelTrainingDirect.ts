import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/mode.interface'
import {
  ModelTrainingConfig,
  validateModelFile,
  uploadModelFile,
  cleanupModelFiles,
  getModelTrainingMessages,
  generateModelRequestId,
} from '@/services/shared/model.utils'

export interface ModelTrainingDirectResult {
  success: boolean
  error?: string
  requestId?: string
}

export const createModelTrainingDirect = async (
  ctx: MyContext,
  filePath: string,
  config: ModelTrainingConfig,
  sendMessage = true
): Promise<ModelTrainingDirectResult> => {
  const requestId = generateModelRequestId(config.telegram_id, config.modelName)

  try {
    logger.info({
      message: '🚀 Начало прямого обучения модели',
      modelName: config.modelName,
      telegram_id: config.telegram_id,
      requestId,
    })

    // Валидация файла
    const modelFile = await validateModelFile(filePath)

    // Загрузка файла
    const uploadResult = await uploadModelFile(modelFile)
    if (!uploadResult.success || !uploadResult.url) {
      throw new Error(uploadResult.error || 'Failed to upload model file')
    }

    // Определяем версию API на основе режима сессии
    const apiVersion = ctx.session.mode === ModeEnum.PROD ? 'v2' : 'v1'

    // Подготовка данных для API запроса
    const apiData = {
      model_url: uploadResult.url,
      trigger_word: config.triggerWord,
      steps: config.steps,
      request_id: requestId,
      api_version: apiVersion,
    }

    // TODO: Здесь будет реальный API запрос
    // Пока просто имитируем успешный запрос для тестирования
    logger.info({
      message: '📤 Отправка запроса на API',
      apiData,
      requestId,
    })

    // Очистка временных файлов
    await cleanupModelFiles(filePath)

    if (sendMessage) {
      const messages = getModelTrainingMessages(ctx.session.is_ru)
      await ctx.reply(messages.success, { parse_mode: 'HTML' })
    }

    return {
      success: true,
      requestId,
    }

  } catch (error) {
    logger.error({
      message: '❌ Ошибка при прямом обучении модели',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    })

    if (sendMessage) {
      const messages = getModelTrainingMessages(ctx.session.is_ru)
      await ctx.reply(messages.error(error instanceof Error ? error.message : 'Unknown error'), {
        parse_mode: 'HTML',
      })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}