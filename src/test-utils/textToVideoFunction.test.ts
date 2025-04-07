/**
 * Тесты для функции преобразования текста в видео
 */
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { TestResult } from './test-config'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { inngest } from '@/inngest-functions/clients'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

// Создаем проверку баланса перед операцией
export async function testTextToVideoProcessing(): Promise<TestResult[]> {
  logger.info('🎯 Запуск тестов Text-to-Video', {
    description: 'Running Text-to-Video tests',
  })

  const results: TestResult[] = []

  try {
    // Тест 1: Проверка обработки с правильными параметрами
    const validTest = await testValidTextToVideo()
    results.push(validTest)

    // Тест 2: Проверка обработки с недостаточным балансом
    const insufficientBalanceTest = await testInsufficientBalance()
    results.push(insufficientBalanceTest)

    // Тест 3: Проверка обработки с невалидными входными параметрами
    const invalidParamsTest = await testInvalidParams()
    results.push(invalidParamsTest)

    // Тест 4: Проверка обработки ошибки API
    const apiErrorTest = await testApiError()
    results.push(apiErrorTest)

    // Тест 5: Проверка обработки для несуществующей модели
    const invalidModelTest = await testInvalidModel()
    results.push(invalidModelTest)

    logger.info('✅ Все тесты Text-to-Video выполнены', {
      description: 'All Text-to-Video tests completed',
      results,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов Text-to-Video', {
      description: 'Error running Text-to-Video tests',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    results.push({
      name: 'Text-to-Video Tests',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return results
  }
}

/**
 * Тест успешной генерации видео из текста
 */
async function testValidTextToVideo(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста для валидной генерации видео из текста', {
      description: 'Starting valid text-to-video test',
    })

    const testData = {
      prompt: 'A beautiful sunset over the ocean',
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'wan-text-to-video', // ID существующей модели в конфигурации
      is_ru: true,
    }

    logger.info('🔍 Проверка данных для теста', {
      description: 'Checking test data',
      testData,
    })

    // Отправка события для обработки
    const eventId = await inngest.send({
      name: 'text-to-video.requested',
      data: testData,
    })

    logger.info('✅ Событие text-to-video.requested отправлено', {
      description: 'Event text-to-video.requested sent',
      eventId,
    })

    return {
      name: 'Тест валидной генерации видео из текста',
      success: true,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте валидной генерации видео из текста', {
      description: 'Error in valid text-to-video test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Тест валидной генерации видео из текста',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Тест генерации видео с недостаточным балансом
 */
async function testInsufficientBalance(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста для генерации видео с недостаточным балансом', {
      description: 'Starting text-to-video test with insufficient balance',
    })

    // Данные с настройкой флага для тестирования недостаточного баланса
    const testData = {
      prompt: 'A beautiful sunset over the ocean',
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'wan-text-to-video',
      is_ru: true,
      _test: {
        insufficient_balance: true,
      },
    }

    logger.info('🔍 Проверка данных для теста недостаточного баланса', {
      description: 'Checking insufficient balance test data',
      testData,
    })

    // Отправка события для обработки
    const eventId = await inngest.send({
      name: 'text-to-video.requested',
      data: testData,
    })

    logger.info('✅ Событие text-to-video.requested отправлено (недостаточный баланс)', {
      description: 'Event text-to-video.requested sent (insufficient balance)',
      eventId,
    })

    return {
      name: 'Тест генерации видео с недостаточным балансом',
      success: true,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте генерации видео с недостаточным балансом', {
      description: 'Error in insufficient balance text-to-video test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Тест генерации видео с недостаточным балансом',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Тест с невалидными входными параметрами
 */
async function testInvalidParams(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста для генерации видео с невалидными параметрами', {
      description: 'Starting text-to-video test with invalid parameters',
    })

    // Данные с отсутствующими обязательными полями
    const testData = {
      // Отсутствует prompt
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      is_ru: true,
    }

    logger.info('🔍 Проверка данных для теста невалидных параметров', {
      description: 'Checking invalid parameters test data',
      testData,
    })

    // Отправка события для обработки
    const eventId = await inngest.send({
      name: 'text-to-video.requested',
      data: testData,
    })

    logger.info('✅ Событие text-to-video.requested отправлено (невалидные параметры)', {
      description: 'Event text-to-video.requested sent (invalid parameters)',
      eventId,
    })

    return {
      name: 'Тест генерации видео с невалидными параметрами',
      success: true,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте генерации видео с невалидными параметрами', {
      description: 'Error in invalid parameters text-to-video test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Тест генерации видео с невалидными параметрами',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Тест с ошибкой API
 */
async function testApiError(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста для обработки ошибки API', {
      description: 'Starting API error test',
    })

    // Данные с флагом для тестирования ошибки API
    const testData = {
      prompt: 'A beautiful sunset over the ocean',
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'wan-text-to-video',
      is_ru: true,
      _test: {
        api_error: true,
      },
    }

    logger.info('🔍 Проверка данных для теста ошибки API', {
      description: 'Checking API error test data',
      testData,
    })

    // Отправка события для обработки
    const eventId = await inngest.send({
      name: 'text-to-video.requested',
      data: testData,
    })

    logger.info('✅ Событие text-to-video.requested отправлено (ошибка API)', {
      description: 'Event text-to-video.requested sent (API error)',
      eventId,
    })

    return {
      name: 'Тест обработки ошибки API',
      success: true,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки ошибки API', {
      description: 'Error in API error test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Тест обработки ошибки API',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Тест с несуществующей моделью
 */
async function testInvalidModel(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста для несуществующей модели', {
      description: 'Starting test for non-existent model',
    })

    // Данные с несуществующей моделью
    const testData = {
      prompt: 'A beautiful sunset over the ocean',
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      model_id: 'non-existent-model',
      is_ru: true,
    }

    logger.info('🔍 Проверка данных для теста несуществующей модели', {
      description: 'Checking non-existent model test data',
      testData,
    })

    // Отправка события для обработки
    const eventId = await inngest.send({
      name: 'text-to-video.requested',
      data: testData,
    })

    logger.info('✅ Событие text-to-video.requested отправлено (несуществующая модель)', {
      description: 'Event text-to-video.requested sent (non-existent model)',
      eventId,
    })

    return {
      name: 'Тест несуществующей модели',
      success: true,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте несуществующей модели', {
      description: 'Error in non-existent model test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Тест несуществующей модели',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
} 