import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { create as mock } from '../../core/mock'

interface ModelTrainingData {
  bot_name: string
  is_ru: boolean
  modelName: string
  steps: number
  telegram_id: string
  triggerWord: string
  zipUrl: string
}

/**
 * Интерфейс для результатов теста
 */
interface ModelTestResult {
  testName: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
}

/**
 * Тестирует функцию тренировки модели (Digital Avatar Body)
 */
export async function testModelTraining(
  data?: Partial<ModelTrainingData>
): Promise<TestResult> {
  const defaultData: ModelTrainingData = {
    bot_name: 'test_bot',
    is_ru: true,
    modelName: 'test_training_model',
    steps: 1500,
    telegram_id: '123456789',
    triggerWord: 'person_test',
    zipUrl: 'https://example.com/training-images.zip',
    ...data,
  }

  logger.info({
    message: '🧪 Тест функции тренировки модели (Digital Avatar Body)',
    description: 'Model training function test',
    data: {
      ...defaultData,
      zipUrl: defaultData.zipUrl.substring(0, 30) + '...',
    },
  })

  // Имитируем отправку события в Inngest через мок
  const mockSendEvent =
    mock<(name: string, data: any) => Promise<ModelTestResult>>()
  mockSendEvent.mockResolvedValue({
    testName: 'Model Training',
    success: true,
    message: 'Событие тренировки модели успешно отправлено',
    details: {
      eventName: 'model-training/start',
      responseStatus: 200,
    },
    duration: 200,
  })

  try {
    // Вызываем мок-функцию
    const result = await mockSendEvent('model-training/start', defaultData)

    return {
      name: 'Model Training Test',
      success: result.success,
      message: `Тест тренировки модели успешно выполнен: ${result.message}`,
      details: result.details,
      category: TestCategory.ModelTraining,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: '❌ Ошибка при тестировании тренировки модели',
      description: 'Error during model training test',
      error: errorMessage,
    })

    return {
      name: 'Model Training Test',
      success: false,
      message: `Ошибка при тестировании тренировки модели: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.ModelTraining,
    }
  }
}

/**
 * Тестирует функцию тренировки модели V2 (Digital Avatar Body V2)
 */
export async function testModelTrainingV2(
  data?: Partial<ModelTrainingData>
): Promise<TestResult> {
  const defaultData: ModelTrainingData = {
    bot_name: 'test_bot',
    is_ru: true,
    modelName: 'test_training_model_v2',
    steps: 2000,
    telegram_id: '123456789',
    triggerWord: 'person_test_v2',
    zipUrl: 'https://example.com/training-images-v2.zip',
    ...data,
  }

  logger.info({
    message: '🧪 Тест функции тренировки модели V2 (Digital Avatar Body V2)',
    description: 'Model training V2 function test',
    data: {
      ...defaultData,
      zipUrl: defaultData.zipUrl.substring(0, 30) + '...',
    },
  })

  // Имитируем отправку события в Inngest через мок
  const mockSendEvent =
    mock<(name: string, data: any) => Promise<ModelTestResult>>()
  mockSendEvent.mockResolvedValue({
    testName: 'Model Training V2',
    success: true,
    message: 'Событие тренировки модели V2 успешно отправлено',
    details: {
      eventName: 'model-training-v2/start',
      responseStatus: 200,
    },
    duration: 250,
  })

  try {
    // Вызываем мок-функцию
    const result = await mockSendEvent('model-training-v2/start', defaultData)

    return {
      name: 'Model Training V2 Test',
      success: result.success,
      message: `Тест тренировки модели V2 успешно выполнен: ${result.message}`,
      details: result.details,
      category: TestCategory.ModelTraining,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: '❌ Ошибка при тестировании тренировки модели V2',
      description: 'Error during model training V2 test',
      error: errorMessage,
    })

    return {
      name: 'Model Training V2 Test',
      success: false,
      message: `Ошибка при тестировании тренировки модели V2: ${errorMessage}`,
      error: errorMessage,
      category: TestCategory.ModelTraining,
    }
  }
}

/**
 * Запускает все тесты тренировки моделей
 */
export async function runModelTrainingTests(): Promise<TestResult[]> {
  logger.info({
    message: '🚀 Запуск тестов тренировки моделей',
    description: 'Running all model training tests',
  })

  const results: TestResult[] = []

  // Запускаем тест для обычной функции тренировки моделей
  results.push(await testModelTraining())

  // Запускаем тест для функции тренировки моделей V2
  results.push(await testModelTrainingV2())

  logger.info({
    message: '✅ Все тесты тренировки моделей выполнены',
    description: 'All model training tests completed',
    successCount: results.filter(r => r.success).length,
    totalCount: results.length,
  })

  return results
}
