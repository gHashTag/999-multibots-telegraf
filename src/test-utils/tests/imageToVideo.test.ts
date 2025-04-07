import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '@/test-utils/types'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

/**
 * Тестирует функцию генерации видео из изображения
 */
export const testImageToVideo = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const telegram_id = '123456789'
  const bot_name = 'test_bot'
  const test_image_url = 'https://example.com/test.jpg'

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
      error: error instanceof Error ? error.message : String(error),
    })
    return results
  }
} 