import { MyContext } from '@/interfaces/telegram-bot.interface'
import { inngest } from '@/services/inngest.service'
import { logger } from '@/utils/logger'
import { isDev, isTest } from '@/config'
import { createModelTrainingDirect } from './createModelTrainingDirect'
import {
  ModelTrainingConfig,
  generateModelRequestId,
  getModelTrainingMessages,
} from '../../shared/model.utils'
import { ModelTrainingRequest, ModelTrainingDirectResult } from '@/interfaces/neuro/model.interface'

// Обновляем интерфейс для ответа Inngest
export interface ModelTrainingResult {
  success: boolean
  error?: string
  eventId?: string
  direct?: boolean
  requestId?: string
  bot_name?: string
  message?: string
}

/**
 * Проверяет правильность окружения и бота
 */
const verifyEnvironmentAndBot = (botName: string): boolean => {
  if (isDev || isTest) {
    const testBotName = process.env.TEST_BOT_NAME || ''
    const isCorrectBot = botName === testBotName

    logger.info('🔍 Проверка тестового бота:', {
      description: isDev ? 'Checking development bot' : 'Checking test bot',
      test_bot_name: testBotName,
      current_bot_name: botName,
      is_correct_bot: isCorrectBot,
    })

    return isCorrectBot
  }

  // В production не используем тестового бота
  const testBotName = process.env.TEST_BOT_NAME || ''
  return botName !== testBotName
}

/**
 * Создает запрос на обучение модели через Inngest с fallback на прямое создание
 */
export async function createModelTraining(
  config: ModelTrainingConfig,
  ctx: MyContext
): Promise<ModelTrainingResult> {
  try {
    // Отправляем запрос через Inngest
    const response = await inngest.send({
      name: 'model/training.create',
      data: {
        config,
        telegram_id: ctx.message?.from?.id.toString() || '',
        is_ru: ctx.session?.is_ru || false
      }
    }) as unknown as { id: string; success: boolean }

    return {
      success: true,
      eventId: response.id
    }
  } catch (error) {
    logger.error('Failed to create model training via Inngest, falling back to direct', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Fallback на прямое создание
    const directResult = await createModelTrainingDirect(
      ctx,
      config.filePath,
      config,
      true // Включаем отправку сообщений
    )
    return {
      success: directResult.success,
      error: directResult.error,
      direct: true,
      requestId: directResult.requestId
    }
  }
}

export async function createModelTrainingOld(
  filePath: string,
  config: ModelTrainingConfig,
  ctx: MyContext
): Promise<ModelTrainingResult> {
  try {
    // Проверяем окружение и бота
    const isCorrectEnvironment = verifyEnvironmentAndBot(config.botName)

    // Генерируем уникальный ID запроса
    const requestId = generateModelRequestId(config.telegram_id, config.modelName)

    logger.info({
      message: '🚀 Запуск обучения модели',
      request_id: requestId,
      model_name: config.modelName,
      telegram_id: config.telegram_id,
      environment: isDev ? 'development' : isTest ? 'test' : 'production',
    })

    let useDirectGeneration = false

    try {
      // План A: Пытаемся использовать Inngest
      logger.info('🔄 План A: Пытаемся использовать Inngest', {
        description: 'Trying to use Inngest (Plan A)',
        request_id: requestId,
      })

      // Отправляем сообщение о начале процесса
      if (isCorrectEnvironment) {
        const messages = getModelTrainingMessages(config.is_ru)
        await ctx.replyWithHTML(messages.started)
      }

      // Определяем имя события в зависимости от режима
      const eventName = ctx.session?.mode === 'DigitalAvatarBodyV2'
        ? 'model-training/v2/requested'
        : 'model-training/start'

      // Отправляем событие в Inngest
      await inngest.send({
        id: requestId,
        name: eventName,
        data: {
          ...config,
          filePath,
        },
      })

      logger.info('✅ Запрос успешно отправлен через Inngest', {
        request_id: requestId,
        event_name: eventName,
      })

      return {
        success: true,
        message: 'Запрос на обучение модели успешно отправлен',
        bot_name: config.botName,
      }
    } catch (inngestError) {
      // Если Inngest недоступен, переключаемся на прямую генерацию
      useDirectGeneration = true

      logger.info('⚠️ План B: Переключение на прямую генерацию', {
        description: 'Switching to direct generation (Plan B)',
        error: inngestError instanceof Error ? inngestError.message : String(inngestError),
        request_id: requestId,
      })
    }

    // План B: Прямая генерация
    if (useDirectGeneration) {
      if (isCorrectEnvironment) {
        await ctx.replyWithHTML('⚙️...')
      }

      const directResult = await createModelTrainingDirect(
        ctx,
        filePath,
        config,
        !isCorrectEnvironment
      )

      if (!directResult.success) {
        throw new Error(directResult.error || 'Unknown error in direct generation')
      }

      return {
        success: true,
        message: 'Модель успешно отправлена на обучение (прямая генерация)',
        requestId: directResult.requestId,
        bot_name: config.botName,
      }
    }

    throw new Error('Unexpected flow: neither Inngest nor direct generation was used')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    logger.error('❌ Критическая ошибка при обучении модели:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      model_name: config.modelName,
      telegram_id: config.telegram_id,
    })

    return {
      success: false,
      message: 'Ошибка при запуске обучения модели',
      error: errorMessage,
      bot_name: config.botName,
    }
  }
} 