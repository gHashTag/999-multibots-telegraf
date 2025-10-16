/**
 * Тест для проверки webhook callback системы Kie.ai
 * Проверяет полный цикл: создание job -> webhook callback -> обновление результата
 */

import axios from 'axios'
import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'
import { logger } from '../src/utils/logger'

// Mock bot для тестирования
const mockBot = {
  telegram: {
    sendMessage: async (chatId: number, text: string, options?: any) => {
      console.log(`📱 [MOCK BOT] Сообщение в чат ${chatId}:`)
      console.log(text)
      console.log('---')
      return { message_id: Date.now() }
    }
  }
}

/**
 * Симулирует успешный webhook callback от Kie.ai
 */
async function simulateSuccessfulCallback(taskId: string) {
  const callbackPayload = {
    id: taskId,
    status: 'succeeded',
    output: 'https://storage.googleapis.com/production_public_bucket/video_id_123456.mp4',
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    logs: null,
    metrics: {
      predict_time: 67.234,
      total_time: 67.234
    },
    urls: {
      get: `https://api.replicate.com/v1/predictions/${taskId}`,
      cancel: `https://api.replicate.com/v1/predictions/${taskId}/cancel`
    },
    version: '8c6e0e4b2f91abcdef1234567890abcd',
    data_removed: false,
    error: null,
    model: 'veed/fabric-1'
  }

  try {
    const response = await axios.post('http://localhost:2999/api/kie-ai/callback', callbackPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    })

    logger.info('✅ [WEBHOOK TEST] Callback отправлен успешно', {
      taskId,
      status: response.status,
      response: response.data
    })

    return response.data
  } catch (error) {
    logger.error('❌ [WEBHOOK TEST] Ошибка отправки callback', {
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Симулирует неудачный webhook callback от Kie.ai
 */
async function simulateFailedCallback(taskId: string) {
  const callbackPayload = {
    id: taskId,
    status: 'failed',
    output: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    logs: 'Error: Unable to process video. Input image resolution too low.',
    error: 'The input image must be at least 512x512 pixels',
    model: 'veed/fabric-1'
  }

  try {
    const response = await axios.post('http://localhost:2999/api/kie-ai/callback', callbackPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    })

    logger.info('✅ [WEBHOOK TEST] Failed callback отправлен успешно', {
      taskId,
      status: response.status,
      response: response.data
    })

    return response.data
  } catch (error) {
    logger.error('❌ [WEBHOOK TEST] Ошибка отправки failed callback', {
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Создаёт тестовую задачу в AsyncLipSyncManager
 */
async function createTestJob(telegramId: string = '144022504') {
  const input = LipSyncInputBuilder.forVeedFabric(
    'https://example.com/test-image.jpg',
    'Test text for lip sync generation',
    telegramId,
    {
      botName: 'webhook-test-bot',
      resolution: '480p',
      isAudioUrl: false
    }
  )

  const jobId = await asyncLipSyncManager.startAsyncGeneration(
    input,
    50.0,
    telegramId,
    parseInt(telegramId),
    { username: 'webhook-test-bot' }
  )

  logger.info('🆔 [WEBHOOK TEST] Создана тестовая задача', {
    jobId,
    telegramId,
    input: {
      provider: input.provider,
      modelId: input.modelId,
      resolution: input.resolution
    }
  })

  return jobId
}

/**
 * Ждёт обновления задачи с таймаутом
 */
async function waitForJobUpdate(jobId: string, expectedStatus: string, maxWaitTime: number = 10000): Promise<boolean> {
  const startTime = Date.now()
  const pollInterval = 500

  while (Date.now() - startTime < maxWaitTime) {
    const job = asyncLipSyncManager.getJobStatus(jobId)

    if (job && job.status === expectedStatus) {
      logger.info(`✅ [WEBHOOK TEST] Job ${jobId} достиг статуса ${expectedStatus}`, {
        jobId,
        status: job.status,
        waitTime: Date.now() - startTime
      })
      return true
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  logger.error(`❌ [WEBHOOK TEST] Job ${jobId} не достиг статуса ${expectedStatus} за ${maxWaitTime}ms`, {
    jobId,
    expectedStatus,
    actualStatus: asyncLipSyncManager.getJobStatus(jobId)?.status,
    waitTime: Date.now() - startTime
  })

  return false
}

/**
 * Главная функция тестирования webhook системы
 */
async function testWebhookSystem() {
  console.log('🔍 [WEBHOOK TEST] Запуск тестирования webhook callback системы')

  try {
    // Устанавливаем mock bot
    asyncLipSyncManager.setBotInstance(mockBot)

    // Тест 1: Успешный callback
    console.log('\n=== ТЕСТ 1: УСПЕШНЫЙ CALLBACK ===')

    const testJobId1 = await createTestJob('144022504')

    // Имитируем taskId, который вернул бы Kie.ai provider
    const mockTaskId1 = `test-task-${Date.now()}-success`
    asyncLipSyncManager.setTaskId(testJobId1, mockTaskId1)

    // Отправляем успешный callback
    await simulateSuccessfulCallback(mockTaskId1)

    // Ждём обновления job
    const success1 = await waitForJobUpdate(testJobId1, 'completed', 5000)

    if (success1) {
      console.log('✅ [WEBHOOK TEST] Тест 1 PASSED: Успешный callback обработан корректно')
    } else {
      console.log('❌ [WEBHOOK TEST] Тест 1 FAILED: Успешный callback не обработан')
    }

    // Тест 2: Неудачный callback
    console.log('\n=== ТЕСТ 2: НЕУДАЧНЫЙ CALLBACK ===')

    const testJobId2 = await createTestJob('144022505')

    // Имитируем taskId для неудачного случая
    const mockTaskId2 = `test-task-${Date.now()}-failed`
    asyncLipSyncManager.setTaskId(testJobId2, mockTaskId2)

    // Отправляем неудачный callback
    await simulateFailedCallback(mockTaskId2)

    // Ждём обновления job
    const success2 = await waitForJobUpdate(testJobId2, 'failed', 5000)

    if (success2) {
      console.log('✅ [WEBHOOK TEST] Тест 2 PASSED: Неудачный callback обработан корректно')
    } else {
      console.log('❌ [WEBHOOK TEST] Тест 2 FAILED: Неудачный callback не обработан')
    }

    // Тест 3: Webhook для несуществующего taskId
    console.log('\n=== ТЕСТ 3: НЕСУЩЕСТВУЮЩИЙ TASKID ===')

    const nonExistentTaskId = `test-task-${Date.now()}-nonexistent`

    try {
      await simulateSuccessfulCallback(nonExistentTaskId)
      console.log('✅ [WEBHOOK TEST] Тест 3 PASSED: Webhook для несуществующего taskId обработан корректно (no error)')
    } catch (error) {
      console.log('❌ [WEBHOOK TEST] Тест 3 FAILED: Webhook для несуществующего taskId вызвал ошибку')
    }

    // Финальная статистика
    console.log('\n=== ФИНАЛЬНАЯ СТАТИСТИКА ===')
    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [WEBHOOK TEST] Статистика AsyncLipSyncManager:', stats)

    console.log('🏁 [WEBHOOK TEST] Тестирование webhook системы завершено')

    return {
      test1_success: success1,
      test2_failed: success2,
      stats
    }

  } catch (error) {
    logger.error('❌ [WEBHOOK TEST] Критическая ошибка в тестировании', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}

// Проверяем доступность API сервера перед тестированием
async function checkServerAvailability() {
  try {
    const response = await axios.get('http://localhost:2999/health', { timeout: 3000 })
    logger.info('✅ [WEBHOOK TEST] API сервер доступен', { status: response.status })
    return true
  } catch (error) {
    logger.error('❌ [WEBHOOK TEST] API сервер недоступен', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return false
  }
}

// Запуск тестирования
async function main() {
  try {
    console.log('🚀 [WEBHOOK TEST] Начало тестирования webhook callback системы')

    // Проверяем доступность сервера
    const serverAvailable = await checkServerAvailability()
    if (!serverAvailable) {
      console.log('❌ [WEBHOOK TEST] API сервер недоступен. Убедитесь, что сервер запущен на порту 3001')
      console.log('💡 [WEBHOOK TEST] Запустите сервер командой: npm run dev')
      process.exit(1)
    }

    // Запускаем тестирование
    const results = await testWebhookSystem()

    // Выводим итоги
    if (results.test1_success && results.test2_failed) {
      console.log('🎉 [WEBHOOK TEST] ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!')
      process.exit(0)
    } else {
      console.log('⚠️ [WEBHOOK TEST] Некоторые тесты не пройдены. Требуется доработка.')
      process.exit(1)
    }

  } catch (error) {
    console.error('💥 [WEBHOOK TEST] Фатальная ошибка:', error)
    process.exit(1)
  }
}

// Запуск при вызове напрямую
if (require.main === module) {
  main()
}

export { testWebhookSystem, simulateSuccessfulCallback, simulateFailedCallback }