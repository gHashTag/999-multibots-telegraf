import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'

import { TestResult } from './interfaces'
import { ModeEnum } from '@/price/helpers/modelsCost'

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
      startTime: Date.now(),
    }
  } catch (error) {
    logger.error('❌ NeuroPhoto test failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: testName,
      success: false,
      message: '❌ NeuroPhoto test failed',
      error: error instanceof Error ? error : new Error(String(error)),
      startTime: Date.now(),
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

export async function runNeurophotoTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting neurophoto test')

    // Генерация изображения
    const generateResult = await TEST_CONFIG.inngestEngine.send({
      name: 'neurophoto/generate',
      data: {
        prompt: 'Test prompt for neurophoto',
        model_url: TEST_CONFIG.models.neurophoto.name,
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.NeuroPhoto,
      },
    })

    if (!generateResult) {
      throw new Error('Failed to generate image')
    }

    logger.info('✅ Image generation request sent', {
      event_id: generateResult.id,
    })

    // Проверка статуса генерации
    const checkResult = await TEST_CONFIG.inngestEngine.send({
      name: 'neurophoto/check',
      data: {
        prompt: 'Test prompt for neurophoto',
        model_url: TEST_CONFIG.models.neurophoto.name,
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.NeuroPhoto,
      },
    })

    if (!checkResult?.id) {
      throw new Error('Failed to check image status')
    }

    logger.info('✅ Image status check completed', {
      event_id: checkResult.id,
    })

    return {
      success: true,
      name: 'Neurophoto Test',
      message: 'Successfully generated and checked image',
      startTime: Date.now(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ Neurophoto test failed:', { error: errorMessage })

    return {
      success: false,
      name: 'Neurophoto Test',
      message: 'Failed to generate or check image',
      error: error instanceof Error ? error : new Error(String(error)),
      startTime: Date.now(),
    }
  }
}
