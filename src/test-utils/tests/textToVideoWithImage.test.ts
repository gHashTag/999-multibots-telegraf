import { InngestTester } from '../inngest-tests'
import { TEST_CONFIG } from '../test-config'
import { TestLogger } from '../test-logger'
import { TestResult } from '../interfaces'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

interface TextToVideoWithImageParams {
  prompt: string
  telegram_id: string
  is_ru: boolean
  bot_name: string
  model_id: string
  image_url: string
  username?: string
}

/**
 * Тестирование генерации видео с изображением
 */
export async function testTextToVideoWithImage(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    TestLogger.logTestInfo(
      '🎬 Начало тестирования генерации видео с изображением',
      'Starting text-to-video with image generation tests'
    )

    // Тестируем каждую модель, которая поддерживает изображения
    const imageModels = Object.entries(VIDEO_MODELS_CONFIG).filter(
      ([_, config]) =>
        config.inputType.includes('image') && !config.inputType.includes('text')
    )

    for (const [modelId, modelConfig] of imageModels) {
      TestLogger.logTestInfo(
        `🔄 Тестирование модели ${modelConfig.title}`,
        `Testing model ${modelId}`
      )

      const params: TextToVideoWithImageParams = {
        prompt: 'Test video generation with image',
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        model_id: modelId,
        image_url: TEST_CONFIG.TEST_IMAGE_URL,
        username: 'test_user',
      }

      // Отправляем событие
      const inngestTester = new InngestTester()
      const eventResult = await inngestTester.sendEvent('text-to-video.requested', {
        ...params,
        [modelConfig.imageKey || 'image']: params.image_url,
      })

      results.push(
        TestLogger.createTestResult({
          name: `Text-to-Video with Image Test (${modelId})`,
          success: eventResult.success,
          message: eventResult.message || '',
          error: eventResult.error,
          details: {
            modelId,
            modelTitle: modelConfig.title,
            imageKey: modelConfig.imageKey,
            params,
          },
          startTime,
        })
      )
    }

    // Тестируем обработку ошибок
    TestLogger.logTestInfo(
      '🔄 Тестирование обработки ошибок',
      'Testing error handling'
    )

    // Тест с отсутствующим изображением
    const errorTestParams: TextToVideoWithImageParams = {
      prompt: 'Test video generation with missing image',
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      is_ru: true,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'kling-v1.6-pro',
      image_url: '',
      username: 'test_user',
    }

    const inngestTester = new InngestTester()
    const errorResult = await inngestTester.sendEvent('text-to-video.requested', {
      ...errorTestParams,
    })

    results.push(
      TestLogger.createTestResult({
        name: 'Text-to-Video Missing Image Error Test',
        success: !errorResult.success, // Ожидаем ошибку
        message: errorResult.message || '',
        error: errorResult.error,
        details: {
          params: errorTestParams,
        },
        startTime,
      })
    )

    // Тест с неподдерживаемой моделью
    const unsupportedModelParams: TextToVideoWithImageParams = {
      prompt: 'Test video generation with unsupported model',
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      is_ru: true,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'unsupported-model',
      image_url: TEST_CONFIG.TEST_IMAGE_URL,
      username: 'test_user',
    }

    const unsupportedResult = await inngestTester.sendEvent(
      'text-to-video.requested',
      {
        ...unsupportedModelParams,
      }
    )

    results.push(
      TestLogger.createTestResult({
        name: 'Text-to-Video Unsupported Model Test',
        success: !unsupportedResult.success, // Ожидаем ошибку
        message: unsupportedResult.message || '',
        error: unsupportedResult.error,
        details: {
          params: unsupportedModelParams,
        },
        startTime,
      })
    )

    return results
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    
    return [
      TestLogger.createTestResult({
        name: 'Text-to-Video with Image Test Suite',
        success: false,
        message: 'Test suite failed',
        error: errorMessage,
        details: { error },
        startTime,
      }),
    ]
  }
} 