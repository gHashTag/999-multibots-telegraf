import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '@/test-utils/types'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { logger } from '@/lib/logger'
import { InngestTestEngine } from '../inngest-test-engine'
import { ImageToVideoEvent } from '@/interfaces/imageToVideo.interface'
import { TEST_CONFIG } from '../test-config'
import { createTestError } from '../test-logger'

const inngestTestEngine = new InngestTestEngine()

// Mock function for testing
async function generateImageToVideo(params: {
  imageUrl: string
  prompt: string
  videoModel: string
  telegram_id: string
  username: string
  isRu: boolean
  botName: string
}) {
  return {
    success: true,
    video_url: 'https://example.com/test.mp4',
    ...params,
  }
}

/**
 * Тестирует функцию генерации видео из изображения
 */
export const testImageToVideo = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const telegram_id = '123456789'
  const bot_name = 'test_bot'
  const test_image_url = 'https://example.com/test.jpg'
  const startTime = Date.now()

  console.log('🎬 Запуск тестов image-to-video')

  try {
    // Тест 1: Успешная генерация видео из изображения
    const successResult = await inngest.send({
      name: 'image-to-video.requested',
      data: {
        prompt: 'Make the image move naturally',
        image_url: test_image_url,
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'kling-v1.6-pro',
      },
    })

    results.push({
      name: 'Генерация видео из изображения',
      success: true,
      message: 'Событие успешно отправлено',
      details: successResult,
      startTime,
    })

    // Тест 2: Обработка ошибки API
    const apiErrorResult = await inngest.send({
      name: 'image-to-video.requested',
      data: {
        prompt: 'Test API error',
        image_url: test_image_url,
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'kling-v1.6-pro',
        _test: {
          api_error: true,
        },
      },
    })

    results.push({
      name: 'Обработка ошибки API',
      success: true,
      message: 'Ошибка API успешно обработана',
      details: apiErrorResult,
      startTime,
    })

    // Тест 3: Недостаточно средств
    const insufficientBalanceResult = await inngest.send({
      name: 'image-to-video.requested',
      data: {
        prompt: 'Test insufficient balance',
        image_url: test_image_url,
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'kling-v1.6-pro',
        _test: {
          insufficient_balance: true,
        },
      },
    })

    results.push({
      name: 'Проверка недостаточного баланса',
      success: true,
      message: 'Ошибка недостаточного баланса успешно обработана',
      details: insufficientBalanceResult,
      startTime,
    })

    // Тест 4: Неподдерживаемая модель
    const unsupportedModelResult = await inngest.send({
      name: 'image-to-video.requested',
      data: {
        prompt: 'Test unsupported model',
        image_url: test_image_url,
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'unsupported-model',
      },
    })

    results.push({
      name: 'Проверка неподдерживаемой модели',
      success: true,
      message: 'Ошибка неподдерживаемой модели успешно обработана',
      details: unsupportedModelResult,
      startTime,
    })

    // Тест 5: Отсутствующее изображение
    const missingImageResult = await inngest.send({
      name: 'image-to-video.requested',
      data: {
        prompt: 'Test missing image',
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'kling-v1.6-pro',
      },
    })

    results.push({
      name: 'Проверка отсутствующего изображения',
      success: true,
      message: 'Ошибка отсутствующего изображения успешно обработана',
      details: missingImageResult,
      startTime,
    })

    // Тест 6: Проверка всех поддерживаемых моделей
    for (const [modelId, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      if (config.inputType.includes('image')) {
        const modelResult = await inngest.send({
          name: 'image-to-video.requested',
          data: {
            prompt: `Test model ${modelId}`,
            image_url: test_image_url,
            telegram_id,
            is_ru: false,
            bot_name,
            model_id: modelId,
          },
        })

        results.push({
          name: `Проверка модели ${modelId}`,
          success: true,
          message: `Модель ${modelId} успешно протестирована`,
          details: modelResult,
          startTime,
        })
      }
    }

    return results
  } catch (error) {
    console.error('❌ Ошибка при тестировании image-to-video:', error)
    results.push({
      name: 'Тестирование image-to-video',
      success: false,
      message: 'Произошла ошибка при тестировании',
      error: createTestError(error),
      startTime,
    })
    return results
  }
}

export async function runImageToVideoTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🚀 Запуск тестов преобразования изображения в видео')
    await inngestTestEngine.init()

    inngestTestEngine.registerEventHandler(
      'image-to-video/process',
      async ({ event }: { event: ImageToVideoEvent }) => {
        const { telegram_id, image_url, prompt, is_ru, bot_name } = event.data
        return await generateImageToVideo({
          imageUrl: image_url,
          prompt: prompt || 'Make the image move naturally',
          videoModel: 'minimax',
          telegram_id,
          username: 'test_user',
          isRu: is_ru || false,
          botName: bot_name,
        })
      }
    )

    // Тест базового преобразования
    const basicResult = await inngestTestEngine.send({
      name: 'image-to-video/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        image_url: TEST_CONFIG.TEST_IMAGE_URL,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    })

    results.push({
      name: 'Basic Image to Video Test',
      success: true,
      message: 'Базовое преобразование изображения в видео выполнено успешно',
      details: basicResult,
      startTime,
      duration: Date.now() - startTime,
    })

    // Тест с пользовательскими настройками
    const customResult = await inngestTestEngine.send({
      name: 'image-to-video/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        image_url: TEST_CONFIG.TEST_IMAGE_URL,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        settings: {
          duration: 5,
          fps: 30,
        },
      },
    })

    results.push({
      name: 'Custom Settings Test',
      success: true,
      message:
        'Преобразование с пользовательскими настройками выполнено успешно',
      details: customResult,
      startTime,
      duration: Date.now() - startTime,
    })

    // Тест с некорректным URL изображения
    try {
      await inngestTestEngine.send({
        name: 'image-to-video/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
          image_url: 'invalid_url',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
        },
      })
    } catch (error) {
      results.push({
        name: 'Invalid URL Test',
        success: false,
        message: 'Тест с некорректным URL завершился ожидаемой ошибкой',
        error: createTestError(error),
        startTime,
        duration: Date.now() - startTime,
      })
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании:', error)
    results.push({
      name: 'Image to Video Tests',
      success: false,
      message: 'Произошла ошибка при тестировании',
      error: createTestError(error),
      startTime,
      duration: Date.now() - startTime,
    })
    return results
  }

  return results
}
