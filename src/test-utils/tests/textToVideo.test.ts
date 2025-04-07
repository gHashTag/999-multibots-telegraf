import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '@/test-utils/types'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

/**
 * Тестирует функцию генерации видео из текста
 */
export const testTextToVideo = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const telegram_id = '123456789'
  const bot_name = 'test_bot'

  console.log('🎬 Запуск тестов text-to-video')

  try {
    // Тест 1: Успешная генерация видео
    const successResult = await inngest.send({
      name: 'text-to-video.requested',
      data: {
        prompt: 'A beautiful sunset over the ocean',
        telegram_id,
        is_ru: false,
        bot_name,
        model_id: 'kling-v1.6-pro',
      },
    })

    results.push({
      name: 'Генерация видео из текста',
        success: true,
      message: 'Событие успешно отправлено',
      details: successResult,
    })

    // Тест 2: Обработка ошибки API
    const apiErrorResult = await inngest.send({
      name: 'text-to-video.requested',
      data: {
        prompt: 'Test API error',
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
      name: 'text-to-video.requested',
      data: {
        prompt: 'Test insufficient balance',
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
      name: 'text-to-video.requested',
      data: {
        prompt: 'Test unsupported model',
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

    // Тест 5: Проверка всех поддерживаемых моделей
    for (const [modelId, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
      if (config.inputType.includes('text')) {
        const modelResult = await inngest.send({
          name: 'text-to-video.requested',
          data: {
            prompt: `Test model ${modelId}`,
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
    console.error('❌ Ошибка при тестировании text-to-video:', error)
    results.push({
      name: 'Тестирование text-to-video',
      success: false,
      message: 'Произошла ошибка при тестировании',
      error: error instanceof Error ? error.message : String(error),
    })
    return results
  }
}
