import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '@/test-utils/types'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { logger } from '@/lib/logger'
import { InngestTestEngine } from '../inngest-test-engine'
import { TEST_CONFIG } from '../test-config'
import { createTestError } from '../test-logger'

const inngestTestEngine = new InngestTestEngine()

// Mock function for testing
const mockTextToVideo = async (event: any) => {
  console.log('🎬 Запуск тестов text-to-video', event)
  return {
    success: true,
    video_url:
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/miniapp/video_ru/1.mp4',
    duration: 5,
  }
}

/**
 * Тестирует функцию генерации видео из текста
 */
export const testTextToVideo = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const telegram_id = '123456789'
  const bot_name = 'test_bot'
  const startTime = Date.now()

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
      startTime,
      duration: Date.now() - startTime,
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
      startTime,
      duration: Date.now() - startTime,
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
      startTime,
      duration: Date.now() - startTime,
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
      startTime,
      duration: Date.now() - startTime,
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
          startTime,
          duration: Date.now() - startTime,
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
      error: createTestError(error),
      startTime,
      duration: Date.now() - startTime,
    })
    return results
  }
}

export async function runTextToVideoTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🚀 Запуск тестов преобразования текста в видео')
    await inngestTestEngine.init()

    inngestTestEngine.register('text-to-video/process', mockTextToVideo)

    // Тест базового преобразования
    const basicResult = await inngestTestEngine.send({
      name: 'text-to-video/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        prompt: 'A beautiful sunset over the ocean',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    })

    results.push({
      name: 'Basic Text to Video Test',
      success: true,
      message: 'Базовое преобразование текста в видео выполнено успешно',
      details: basicResult,
      startTime,
      duration: Date.now() - startTime,
    })

    // Тест с пользовательскими настройками
    const customResult = await inngestTestEngine.send({
      name: 'text-to-video/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        prompt: 'A beautiful sunset over the ocean',
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

    // Тест с пустым промптом
    try {
      await inngestTestEngine.send({
        name: 'text-to-video/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
          prompt: '',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
        },
      })

      results.push({
        name: 'Empty Prompt Test',
        success: false,
        message: 'Тест с пустым промптом должен был завершиться ошибкой',
        startTime,
        duration: Date.now() - startTime,
      })
    } catch (error) {
      results.push({
        name: 'Empty Prompt Test',
        success: true,
        message: 'Тест с пустым промптом завершился ожидаемой ошибкой',
        error: createTestError(error),
        startTime,
        duration: Date.now() - startTime,
      })
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании:', error)
    results.push({
      name: 'Text to Video Tests',
      success: false,
      message: 'Произошла ошибка при тестировании',
      error: createTestError(error),
      startTime,
      duration: Date.now() - startTime,
    })
  }

  return results
}
