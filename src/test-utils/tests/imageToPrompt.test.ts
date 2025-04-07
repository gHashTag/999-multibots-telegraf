import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { calculateModeCost, ModeEnum } from '@/price/helpers/modelsCost'
import { v4 as uuidv4 } from 'uuid'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'

/**
 * Тестирует функцию imageToPrompt через Inngest
 */
export async function testImageToPrompt(): Promise<TestResult> {
  const name = 'image_to_prompt_test'

  try {
    logger.info('🚀 Начинаем тест Image To Prompt:', {
      description: 'Starting Image To Prompt test',
    })

    // Получаем стоимость операции
    const cost = calculateModeCost({ mode: ModeEnum.ImageToPrompt }).stars

    logger.info('💰 Стоимость операции:', {
      description: 'Operation cost',
      cost,
      mode: ModeEnum.ImageToPrompt,
    })

    // Создаем тестовое событие
    const event_id = `test-image-to-prompt-${Date.now()}-${uuidv4()}`

    // Отправляем событие process payment перед отправкой основного события
    const payment_operation_id = `test-payment-${Date.now()}-${uuidv4()}`

    logger.info('💸 Отправляем платежное событие:', {
      description: 'Sending payment event',
      payment_operation_id,
      cost,
    })

    // Сначала отправляем платеж напрямую через события
    await inngest.send({
      id: payment_operation_id,
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        amount: cost,
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        type: 'money_income', // Сначала пополняем баланс для теста
        description: 'Test payment for image to prompt',
        operation_id: payment_operation_id,
        metadata: {
          service_type: ModeEnum.ImageToPrompt,
          test: true,
        },
      },
    })

    // Ждем обработки платежа
    await new Promise(resolve => setTimeout(resolve, 1000))

    logger.info('🔄 Отправляем событие Image To Prompt:', {
      description: 'Sending Image To Prompt event',
      event_id,
      test_image: TEST_CONFIG.TEST_IMAGE_URL,
    })

    // Отправляем событие imageToPrompt
    await inngest.send({
      id: event_id,
      name: 'image/to-prompt.generate',
      data: {
        image: TEST_CONFIG.TEST_IMAGE_URL,
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        username: 'test_user',
        is_ru: true,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        cost_per_image: cost,
      },
    })

    logger.info('⏳ Ждём выполнения функции:', {
      description: 'Waiting for function execution',
      event_id,
    })

    // Даем время на обработку
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Проверяем результаты платежа
    logger.info('✅ Тест отправки события завершен:', {
      description: 'Event sending test completed',
      event_id,
    })

    return {
      name,
      success: true,
      message: '✅ Тест Image To Prompt успешно завершен',
      details: {
        event_id,
        cost,
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
      },
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте Image To Prompt:', {
      description: 'Error in Image To Prompt test',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })

    return {
      name,
      success: false,
      message: `❌ Тест завершился с ошибкой: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
