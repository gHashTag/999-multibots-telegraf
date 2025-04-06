import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { TestResult } from '../interfaces'
import { TEST_CONFIG } from '../test-config'
import { generateRandomTelegramId } from '@/utils/generateRandomTelegramId'

interface BroadcastTestResult extends TestResult {
  telegram_id?: string
  message_sent?: boolean
}

export async function testBroadcastMessage(): Promise<BroadcastTestResult[]> {
  const results: BroadcastTestResult[] = []
  const testTelegramId = String(generateRandomTelegramId())

  logger.info('🚀 Начинаем тестирование broadcast message...', {
    description: 'Starting broadcast message tests',
    telegram_id: testTelegramId,
  })

  try {
    // Тест 1: Отправка простого текстового сообщения
    const simpleMessageResult = await inngest.send({
      name: 'broadcast/message',
      data: {
        telegram_id: testTelegramId,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        textRu: 'Тестовое сообщение',
        textEn: 'Test message',
        test_mode: true,
        test_telegram_id: testTelegramId,
      },
    })

    results.push({
      name: '✉️ Отправка простого текстового сообщения',
      success: !!simpleMessageResult,
      message: 'Простое текстовое сообщение отправлено',
      telegram_id: testTelegramId,
      message_sent: true,
    })

    // Тест 2: Отправка сообщения с изображением
    const imageMessageResult = await inngest.send({
      name: 'broadcast/send-message',
      data: {
        telegram_id: testTelegramId,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        textRu: 'Тестовое сообщение с изображением',
        textEn: 'Test message with image',
        contentType: 'photo',
        imageUrl: TEST_CONFIG.TEST_IMAGE_URL,
        test_mode: true,
        test_telegram_id: testTelegramId,
      },
    })

    results.push({
      name: '🖼️ Отправка сообщения с изображением',
      success: !!imageMessageResult,
      message: 'Сообщение с изображением отправлено',
      telegram_id: testTelegramId,
      message_sent: true,
    })

    // Тест 3: Отправка сообщения с кнопками
    const buttonMessageResult = await inngest.send({
      name: 'broadcast/send-message',
      data: {
        telegram_id: testTelegramId,
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        textRu: 'Тестовое сообщение с кнопками',
        textEn: 'Test message with buttons',
        test_mode: true,
        test_telegram_id: testTelegramId,
        parse_mode: 'HTML',
      },
    })

    results.push({
      name: '🔘 Отправка сообщения с кнопками',
      success: !!buttonMessageResult,
      message: 'Сообщение с кнопками отправлено',
      telegram_id: testTelegramId,
      message_sent: true,
    })

    logger.info('✅ Тестирование broadcast message завершено успешно', {
      description: 'Broadcast message tests completed successfully',
      results,
    })
  } catch (error) {
    const err = error as Error
    logger.error('❌ Ошибка при тестировании broadcast message:', {
      description: 'Error in broadcast message tests',
      error: err.message,
      stack: err.stack,
    })

    results.push({
      name: '❌ Ошибка тестирования broadcast message',
      success: false,
      message: 'Ошибка при тестировании broadcast message',
      error: err.message,
    })
  }

  return results
}

// Запускаем тест если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    try {
      const results = await testBroadcastMessage()
      console.log('📊 Результаты тестов:', results)
      process.exit(0)
    } catch (error) {
      console.error('❌ Ошибка при запуске тестов:', error)
      process.exit(1)
    }
  })()
}
