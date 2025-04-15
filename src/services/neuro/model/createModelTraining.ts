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
import { v4 as uuidv4 } from 'uuid'

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
  // Создаем уникальный ID для отслеживания запроса
  const requestId = `mt-${ctx.message?.from?.id}-${Date.now()}-${uuidv4().substring(0, 8)}`;

  // Подготовка данных события
  const eventData = {
    config,
    telegram_id: ctx.message?.from?.id.toString() || '',
    is_ru: ctx.session?.is_ru || false,
    username: ctx.message?.from?.username || '',
  };

  logger.info('🔍 Подготовка запроса на обучение модели:', {
    description: 'Preparing model training request',
    request_id: requestId,
    telegram_id: eventData.telegram_id,
    is_ru: eventData.is_ru,
  });

  try {
    let useDirectCreation = false;

    try {
      // План A: Пытаемся использовать Inngest
      logger.info('🔄 План A: Пытаемся использовать Inngest', {
        description: 'Trying to use Inngest (Plan A)',
        request_id: requestId,
      });

      // Отправляем сообщение пользователю
      await ctx.reply(
        ctx.session?.is_ru
          ? '🚀 Ваш запрос на обучение модели принят! Результат будет отправлен в этот чат.'
          : '🚀 Your model training request has been accepted! The result will be sent to this chat.'
      );

      // Отправляем запрос через Inngest
      const response = await inngest.send({
        id: requestId,
        name: 'model/training.create',
        data: eventData,
      });

      logger.info('✅ Запрос успешно отправлен через Inngest:', {
        description: 'Request successfully sent via Inngest',
        request_id: requestId,
        response: JSON.stringify(response || {}),
      });

      return {
        success: true,
        eventId: requestId,
      };
    } catch (inngestError) {
      // Если Inngest выдал ошибку, устанавливаем флаг для прямого создания
      useDirectCreation = true;

      logger.info('⚠️ План B: Переключение на прямое создание', {
        description: 'Switching to direct creation (Plan B)',
        error: inngestError instanceof Error ? inngestError.message : String(inngestError),
        request_id: requestId,
      });
    }

    // Если Inngest выдал ошибку, используем прямое создание
    if (useDirectCreation) {
      // Отправляем сообщение о переключении на резервный вариант
      await ctx.reply(ctx.session?.is_ru ? '⚙️...' : '⚙️...');

      logger.info('🔄 Запуск прямого создания:', {
        description: 'Starting direct creation',
        request_id: requestId,
      });

      // Используем прямое создание
      const directResult = await createModelTrainingDirect(
        ctx,
        config.filePath,
        config,
        true // Включаем отправку сообщений
      );

      logger.info('✅ Результат прямого создания:', {
        description: 'Direct creation result',
        request_id: requestId,
        success: directResult.success,
      });

      return {
        success: directResult.success,
        error: directResult.error,
        direct: true,
        requestId: directResult.requestId,
      };
    }

    // Этот код не должен выполниться, но TypeScript требует return
    throw new Error('Unexpected execution path');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('❌ Критическая ошибка при создании модели:', {
      description: 'Critical error during model creation',
      request_id: requestId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Отправляем сообщение об ошибке пользователю
    await ctx.reply(
      ctx.session?.is_ru
        ? '😔 Произошла критическая ошибка при создании модели. Пожалуйста, попробуйте позже.'
        : '😔 A critical error occurred during model creation. Please try again later.'
    );

    return {
      success: false,
      error: errorMessage,
      requestId,
    };
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