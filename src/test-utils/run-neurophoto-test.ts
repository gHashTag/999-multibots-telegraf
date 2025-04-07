import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'

import { TestResult } from './interfaces'

interface NeuroPhotoGenerateEvent {
  name: 'neuro/photo.generate'
  data: {
    prompt: string
    model_url: string
    numImages: number
    telegram_id: string | number
    username: string
    is_ru: boolean
    bot_name: string
  }
}

/**
 * Тест генерации нейрофото
 */
async function testNeuroPhotoGeneration(): Promise<TestResult> {
  const testName = '🎨 Test NeuroPhoto Generation'

  try {
    logger.info('🚀 Starting neurophoto test', {
      description: 'Testing neurophoto generation',
    })

    // Отправляем событие для генерации фото
    await inngest.send<NeuroPhotoGenerateEvent>({
      name: 'neuro/photo.generate',
      data: {
        prompt: 'Test prompt for neurophoto generation',
        model_url: TEST_CONFIG.models.neurophoto.name,
        numImages: 1,
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        username: 'test_user',
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    })

    logger.info('✅ Neurophoto generation event sent', {
      description: 'Event sent successfully',
      user_id: TEST_CONFIG.TEST_USER_ID,
    })

    // Тест обработки ошибок
    await inngest.send<NeuroPhotoGenerateEvent>({
      name: 'neuro/photo.generate',
      data: {
        prompt: 'Test prompt for error case',
        model_url: TEST_CONFIG.models.neurophoto.name,
        numImages: 1,
        telegram_id: '999999999', // Несуществующий пользователь
        username: 'test_user',
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    })

    logger.info('✅ Error case test completed', {
      description: 'Error handling test completed',
    })

    return {
      name: testName,
      success: true,
      message: '✅ NeuroPhoto tests completed successfully',
    }
  } catch (error) {
    logger.error('❌ NeuroPhoto test failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: testName,
      success: false,
      message: '❌ NeuroPhoto test failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Запускаем тесты
async function runTests() {
  logger.info({
    message: '🚀 Запуск тестов нейрофото',
    description: 'Starting neurophoto tests',
  })

  try {
    const result = await testNeuroPhotoGeneration()

    logger.info({
      message: result.success ? '✅ Тест успешно завершен' : '❌ Тест провален',
      description: 'Test completed',
      testName: result.name,
      success: result.success,
      details: result.message,
      error: result.error,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при выполнении теста',
      description: 'Error running test',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Запускаем тесты
runTests()

export { testNeuroPhotoGeneration }
