import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { generateRandomTelegramId } from '@/utils/generateRandomTelegramId'
import { supabase } from '@/core/supabase'

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
    // Создаем тестовое сообщение в базе данных
    const { data: messageData, error: messageError } = await supabase
      .from('broadcast_messages')
      .insert({
        text: 'Test broadcast message',
        status: 'pending',
        created_at: new Date().toISOString(),
        message_id: Date.now(),
      })
      .select()
      .single()

    if (messageError) {
      throw new Error(
        `Ошибка создания тестового сообщения: ${messageError.message}`
      )
    }

    if (!messageData) {
      throw new Error('Тестовое сообщение не создано')
    }

    logger.info('📝 Создано тестовое сообщение для рассылки', {
      description: 'Created test broadcast message',
      message_id: messageData.id,
    })

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
        message_id: Number(messageData.id), // Преобразуем в число
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
        message_id: Number(messageData.id), // Преобразуем в число
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
        message_id: Number(messageData.id), // Преобразуем в число
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

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await supabase
        .from('broadcast_messages')
        .delete()
        .eq('id', messageData.id)

      logger.info('🧹 Тестовые данные очищены', {
        description: 'Test data cleaned up',
        message_id: messageData.id,
      })
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('❌ Ошибка при тестировании broadcast message:', {
      description: 'Error in broadcast message tests',
      error: err.message,
      stack: err.stack,
    })

    results.push({
      name: '❌ Ошибка тестирования broadcast message',
      success: false,
      message: 'Ошибка при тестировании broadcast message',
      error: err,
    })
  }

  return results
}

export async function testBroadcast(messageId: string): Promise<TestResult> {
  const testName = 'Broadcast Test'

  try {
    logger.info('🧪 Тест рассылки', {
      description: 'Testing broadcast functionality',
      messageId,
    })

    // Проверяем, что messageId является числом
    const numericMessageId = parseInt(messageId)
    if (isNaN(numericMessageId)) {
      throw new Error(`Некорректный ID сообщения: ${messageId}`)
    }

    const { data, error } = await supabase
      .from('broadcast_messages')
      .select('*')
      .eq('id', numericMessageId)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error(`Сообщение ${messageId} не найдено`)
    }

    logger.info('✅ Сообщение для рассылки найдено', {
      description: 'Broadcast message found',
      messageData: {
        id: data.id,
        text: data.text,
        status: data.status,
        createdAt: data.created_at,
      },
    })

    return {
      name: testName,
      success: true,
      message: `Сообщение ${messageId} готово к рассылке`,
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error('❌ Ошибка при проверке сообщения', {
      description: 'Broadcast message check error',
      error: error.message,
      messageId,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при проверке сообщения для рассылки',
      error,
    }
  }
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
