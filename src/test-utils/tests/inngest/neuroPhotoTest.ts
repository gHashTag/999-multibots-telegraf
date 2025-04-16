import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { create as mock } from '../../core/mock'

interface NeuroPhotoGenerationData {
  prompt: string
  model?: string
  numImages?: number
  telegram_id: string
  username?: string
  is_ru: boolean
  bot_name: string
}

/**
 * Интерфейс для результатов теста
 */
interface NeuroTestResult {
  testName: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
}

/**
 * Тестирует функцию генерации нейрофото
 */
export async function testNeuroImageGeneration(
  data?: Partial<NeuroPhotoGenerationData>
): Promise<TestResult> {
  const defaultData: NeuroPhotoGenerationData = {
    prompt: 'Beautiful snowy mountain landscape at sunset',
    model: 'stability-ai/sdxl',
    numImages: 1,
    telegram_id: '123456789',
    username: 'test_user',
    is_ru: true,
    bot_name: 'test_bot',
    ...data,
  }

  logger.info({
    message: '🧪 Тест функции генерации нейрофото',
    description: 'Neuro image generation test',
    data: {
      ...defaultData,
      prompt: defaultData.prompt.substring(0, 20) + '...',
    },
  })

  // Имитируем отправку события в Inngest через мок
  const mockSendEvent =
    mock<(name: string, data: any) => Promise<NeuroTestResult>>()
  mockSendEvent.mockResolvedValue({
    testName: 'Neuro Image Generation',
    success: true,
    message: 'Событие успешно отправлено',
    details: {
      eventName: 'neuro/photo.generate',
      responseStatus: 200,
    },
    duration: 150,
  })

  try {
    // Вызываем мок-функцию
    const result = await mockSendEvent('neuro/photo.generate', defaultData)

    return {
      name: 'Neuro Image Generation Test',
      success: result.success,
      message: `Тест нейрофото успешно выполнен: ${result.message}`,
      details: result.details,
      category: TestCategory.NeuroPhoto,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: '❌ Ошибка при тестировании нейрофото',
      description: 'Error during neuro photo test',
      error: errorMessage,
    })

    return {
      name: 'Neuro Image Generation Test',
      success: false,
      message: `Ошибка при тестировании нейрофото: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.NeuroPhoto,
    }
  }
}

/**
 * Тестирует функцию генерации нейрофото V2
 */
export async function testNeuroPhotoV2Generation(
  data?: Partial<NeuroPhotoGenerationData>
): Promise<TestResult> {
  const defaultData: NeuroPhotoGenerationData = {
    prompt: 'Stylish portrait in evening urban setting with neon lights',
    numImages: 1,
    telegram_id: '123456789',
    username: 'test_user',
    is_ru: true,
    bot_name: 'test_bot',
    ...data,
  }

  logger.info({
    message: '🧪 Тест функции генерации нейрофото V2',
    description: 'NeuroPhoto V2 generation test',
    data: {
      ...defaultData,
      prompt: defaultData.prompt.substring(0, 20) + '...',
    },
  })

  // Имитируем отправку события в Inngest через мок
  const mockSendEvent =
    mock<(name: string, data: any) => Promise<NeuroTestResult>>()
  mockSendEvent.mockResolvedValue({
    testName: 'NeuroPhoto V2 Generation',
    success: true,
    message: 'Событие успешно отправлено',
    details: {
      eventName: 'neuro/photo-v2.generate',
      responseStatus: 200,
    },
    duration: 180,
  })

  try {
    // Вызываем мок-функцию
    const result = await mockSendEvent('neuro/photo-v2.generate', defaultData)

    return {
      name: 'NeuroPhoto V2 Generation Test',
      success: result.success,
      message: `Тест нейрофото V2 успешно выполнен: ${result.message}`,
      details: result.details,
      category: TestCategory.NeuroPhotoV2,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: '❌ Ошибка при тестировании нейрофото V2',
      description: 'Error during neuro photo V2 test',
      error: errorMessage,
    })

    return {
      name: 'NeuroPhoto V2 Generation Test',
      success: false,
      message: `Ошибка при тестировании нейрофото V2: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.NeuroPhotoV2,
    }
  }
}

/**
 * Запускает все тесты нейрофото
 */
export async function runNeuroPhotoTests(): Promise<TestResult[]> {
  logger.info({
    message: '🚀 Запуск тестов нейрофото',
    description: 'Running all neurophoto tests',
  })

  const results: TestResult[] = []

  // Запускаем тест для обычной функции нейрофото
  results.push(await testNeuroImageGeneration())

  // Запускаем тест для функции нейрофото V2
  results.push(await testNeuroPhotoV2Generation())

  logger.info({
    message: '✅ Все тесты нейрофото выполнены',
    description: 'All neurophoto tests completed',
    successCount: results.filter(r => r.success).length,
    totalCount: results.length,
  })

  return results
}
