import { isRussian } from '@/helpers'
import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { generateNeuroPhotoDirect } from './generateNeuroPhotoDirect'
import { MyContext } from '@/interfaces'
import { isDev, isTest } from '@/config'

/**
 * Отправляет запрос на генерацию нейроизображения через Inngest
 * С резервным вариантом прямой генерации при недоступности Inngest
 */
export async function generateNeuroImage(
  prompt: string,
  model_url: string,
  numImages: number | string,
  telegram_id: string,
  ctx: Context,
  botName: string
): Promise<void> {
  // Валидация входных данных
  if (!prompt) {
    throw new Error('Prompt not found')
  }

  if (!model_url) {
    throw new Error('Model URL not found')
  }

  // Проверка среды выполнения и правильного бота
  const isCorrectEnvironment = verifyEnvironmentAndBot(botName)

  // Преобразуем numImages в число
  const validNumImages = numImages ? parseInt(String(numImages), 10) : 1

  if (isNaN(validNumImages)) {
    logger.error('❌ Некорректное значение numImages:', {
      description: 'Invalid numImages value',
      received_value: numImages,
      received_type: typeof numImages,
      environment: isDev ? 'development' : isTest ? 'test' : 'production',
    })
  }

  // Создаем стабильный и уникальный ID события - это помогает избежать дубликатов
  const requestId = `np-${telegram_id}-${Date.now()}-${uuidv4().substring(0, 8)}`

  // Данные события
  const eventData = {
    prompt,
    model_url,
    numImages: validNumImages,
    telegram_id,
    username: ctx.message?.from?.username || '',
    is_ru: isRussian(ctx),
    bot_name: botName,
  }

  // Логируем запрос до отправки
  logger.info('🔍 Подготовка запроса на генерацию:', {
    description: 'Preparing neuro photo generation request',
    request_id: requestId,
    telegram_id,
    prompt: prompt.substring(0, 30) + '...',
    model_url: model_url.substring(0, 30) + '...',
    numImages: validNumImages,
    bot_name: botName,
    is_ru: isRussian(ctx),
    environment: isDev ? 'development' : isTest ? 'test' : 'production',
  })

  try {
    // Здесь пробуем использовать Inngest, но с обязательным fallback на прямую генерацию в случае ошибки
    let useDirectGeneration = false

    try {
      // План A: Пытаемся использовать Inngest
      logger.info('🔄 План A: Пытаемся использовать Inngest', {
        description: 'Trying to use Inngest (Plan A)',
        request_id: requestId,
        environment: isDev ? 'development' : isTest ? 'test' : 'production',
      })

      // Отправляем пользователю сообщение о том, что запрос принят через Inngest
      // Но только если мы в правильном окружении и используем правильный бот
      if (isCorrectEnvironment) {
        await ctx.reply(
          isRussian(ctx)
            ? '🚀 Ваш запрос на генерацию изображения принят! Результат будет отправлен в этот чат в ближайшее время.'
            : '🚀 Your image generation request has been accepted! The result will be sent to this chat shortly.'
        )
      } else {
        logger.info(
          '⚠️ Пропускаем отправку сообщения в чат (неправильное окружение/бот)',
          {
            description: 'Skipping message sending (wrong environment/bot)',
            request_id: requestId,
            environment: isDev ? 'development' : isTest ? 'test' : 'production',
            bot_name: botName,
          }
        )
      }

      // Вызываем существующую функцию через событие neuro/photo.generate
      const response = await inngest.send({
        id: requestId,
        name: 'neuro/photo.generate',
        data: eventData,
      })

      logger.info('🚀 Запрос на генерацию отправлен через Inngest:', {
        description: 'Image generation request sent via Inngest',
        request_id: requestId,
        prompt: prompt.substring(0, 30) + '...',
        model_url: model_url.substring(0, 30) + '...',
        numImages: validNumImages,
        telegram_id,
        botName,
        response: JSON.stringify(response || {}),
        environment: isDev ? 'development' : isTest ? 'test' : 'production',
      })
    } catch (inngestError) {
      // Если Inngest выдал ошибку, устанавливаем флаг для использования прямой генерации
      useDirectGeneration = true

      logger.info('⚠️ План B: Переключение на прямую генерацию', {
        description: 'Switching to direct generation (Plan B)',
        error:
          inngestError instanceof Error
            ? inngestError.message
            : String(inngestError),
        request_id: requestId,
        environment: isDev ? 'development' : isTest ? 'test' : 'production',
      })
    }

    // Если Inngest выдал ошибку, используем прямую генерацию
    if (useDirectGeneration) {
      // Отправляем пользователю сообщение о переключении на резервный вариант
      // Но только если мы в правильном окружении и используем правильный бот
      if (isCorrectEnvironment) {
        await ctx.reply(isRussian(ctx) ? '⚙️...' : '⚙️...')
      } else {
        logger.info(
          '⚠️ Пропускаем отправку сообщения в чат (неправильное окружение/бот)',
          {
            description: 'Skipping message sending (wrong environment/bot)',
            request_id: requestId,
            environment: isDev ? 'development' : isTest ? 'test' : 'production',
            bot_name: botName,
          }
        )
      }

      logger.info('🔄 Запуск прямой генерации:', {
        description: 'Starting direct generation',
        request_id: requestId,
        telegram_id,
        environment: isDev ? 'development' : isTest ? 'test' : 'production',
      })

      // Используем прямую генерацию через generateNeuroPhotoDirect
      const directResult = await generateNeuroPhotoDirect(
        prompt,
        model_url,
        validNumImages,
        telegram_id,
        ctx as MyContext,
        botName,
        // Передаем опцию disable_telegram_sending, если мы в неправильном окружении
        { disable_telegram_sending: !isCorrectEnvironment }
      )

      logger.info('✅ Результат прямой генерации:', {
        description: 'Direct generation result',
        request_id: requestId,
        success: directResult?.success,
        urls_count: directResult?.urls?.length || 0,
        environment: isDev ? 'development' : isTest ? 'test' : 'production',
      })

      // Если прямая генерация не удалась, сообщаем об этом пользователю
      // Но только если мы в правильном окружении и используем правильный бот
      if (!directResult?.success && isCorrectEnvironment) {
        await ctx.reply(
          isRussian(ctx)
            ? '❌ Не удалось сгенерировать изображение. Пожалуйста, попробуйте позже.'
            : '❌ Failed to generate image. Please try again later.'
        )
      }
    }
  } catch (error) {
    const typedError = error as Error
    logger.error('❌ Критическая ошибка при генерации:', {
      description: 'Critical error during generation',
      request_id: requestId,
      error: typedError.message,
      stack: typedError.stack,
      telegram_id,
      prompt: prompt.substring(0, 30) + '...',
      environment: isDev ? 'development' : isTest ? 'test' : 'production',
    })

    // Отправляем сообщение об ошибке только если мы в правильном окружении
    if (isCorrectEnvironment) {
      await ctx.reply(
        isRussian(ctx)
          ? '😔 Произошла критическая ошибка при генерации. Пожалуйста, попробуйте позже.'
          : '😔 A critical error occurred during generation. Please try again later.'
      )
    }
  }
}

/**
 * Функция для проверки правильности окружения и бота
 * Возвращает true, если сообщения можно отправлять в текущем окружении
 */
function verifyEnvironmentAndBot(botName: string): boolean {
  // В режиме разработки проверяем, что используется тестовый бот
  if (isDev) {
    // Получаем имя тестового бота из переменной окружения
    const devBotName = process.env.TEST_BOT_NAME || ''

    // Проверяем, совпадает ли имя бота с TEST_BOT_NAME
    const isCorrectBot = botName === devBotName

    logger.info('🔍 Проверка бота для разработки:', {
      description: 'Checking development bot',
      dev_bot_name: devBotName,
      current_bot_name: botName,
      is_correct_bot: isCorrectBot,
    })

    return isCorrectBot
  }

  // В режиме тестирования проверяем, что используется тестовый бот
  if (isTest) {
    // Получаем имя тестового бота из переменной окружения
    const testBotName = process.env.TEST_BOT_NAME || ''

    // Проверяем, совпадает ли имя бота с TEST_BOT_NAME
    const isCorrectBot = botName === testBotName

    logger.info('🔍 Проверка бота для тестирования:', {
      description: 'Checking test bot',
      test_bot_name: testBotName,
      current_bot_name: botName,
      is_correct_bot: isCorrectBot,
    })

    // В тестовом окружении отправляем сообщения только если имя бота совпадает с TEST_BOT_NAME
    return isCorrectBot
  }

  // В режиме production разрешаем отправку сообщений только если НЕ тестовый бот
  const testBotName = process.env.TEST_BOT_NAME || ''
  const isTestBot = botName === testBotName

  if (isTestBot) {
    logger.info('⚠️ Предотвращение отправки из тестового бота в production:', {
      description: 'Preventing test bot from sending in production',
      test_bot_name: testBotName,
      current_bot_name: botName,
      is_test_bot: isTestBot,
    })
    return false
  }

  return true
}
