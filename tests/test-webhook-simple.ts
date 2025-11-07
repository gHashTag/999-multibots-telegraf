/**
 * Простой тест webhook системы без реальных задач
 * Проверяет только корректность обработки webhook callbacks
 */

import axios from 'axios'
import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
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
 * Создаёт mock job напрямую в AsyncLipSyncManager без запуска провайдера
 */
function createMockJob(telegramId: string, taskId: string): string {
  const jobId = `mock_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Создаём mock job напрямую в мапе
  const mockJob = {
    id: jobId,
    telegramId,
    chatId: parseInt(telegramId),
    startTime: Date.now(),
    input: {
      provider: 'kie' as const,
      modelId: 'veed-fabric' as const,
      imageUrl: 'https://example.com/test-image.jpg',
      text: 'Test text',
      resolution: '480p' as const
    },
    cost: 50.0,
    status: 'processing' as const,
    taskId: taskId,
    botInfo: { username: 'mock-bot' }
  }

  // Добавляем job в мап через приватный доступ
  // @ts-ignore - доступ к приватному полю для тестирования
  asyncLipSyncManager.jobs.set(jobId, mockJob)

  logger.info('🆔 [MOCK WEBHOOK TEST] Создан mock job', {
    jobId,
    taskId,
    telegramId
  })

  return jobId
}

/**
 * Отправляет callback webhook
 */
async function sendWebhookCallback(taskId: string, success: boolean = true) {
  const callbackPayload = success ? {
    id: taskId,
    status: 'succeeded',
    output: 'https://storage.googleapis.com/test_bucket/video_123.mp4',
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    model: 'veed/fabric-1'
  } : {
    id: taskId,
    status: 'failed',
    output: null,
    error: 'Test error: Processing failed',
    model: 'veed/fabric-1'
  }

  try {
    const response = await axios.post('http://localhost:2999/api/kie-ai/callback', callbackPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    })

    logger.info(`✅ [MOCK WEBHOOK TEST] ${success ? 'Success' : 'Failed'} callback отправлен`, {
      taskId,
      status: response.status
    })

    return response.status === 202
  } catch (error) {
    logger.error('❌ [MOCK WEBHOOK TEST] Ошибка отправки callback', {
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return false
  }
}

/**
 * Проверяет, обновился ли job
 */
function checkJobStatus(jobId: string, expectedStatus: string): boolean {
  const job = asyncLipSyncManager.getJobStatus(jobId)

  if (!job) {
    logger.error('❌ [MOCK WEBHOOK TEST] Job не найден', { jobId })
    return false
  }

  const success = job.status === expectedStatus
  logger.info(`${success ? '✅' : '❌'} [MOCK WEBHOOK TEST] Job статус проверка`, {
    jobId,
    actualStatus: job.status,
    expectedStatus,
    success
  })

  return success
}

/**
 * Проверяет доступность API сервера
 */
async function checkApiServer(): Promise<boolean> {
  try {
    const response = await axios.get('http://localhost:2999/health', { timeout: 3000 })
    return response.status === 200
  } catch (error) {
    return false
  }
}

/**
 * Главная функция тестирования
 */
async function testWebhookCallbacks() {
  console.log('🔍 [MOCK WEBHOOK TEST] Запуск тестирования webhook callbacks')

  // Устанавливаем mock bot
  asyncLipSyncManager.setBotInstance(mockBot)

  let passedTests = 0
  let totalTests = 0

  try {
    // Проверяем доступность API сервера
    const serverAvailable = await checkApiServer()
    if (!serverAvailable) {
      console.log('❌ [MOCK WEBHOOK TEST] API сервер недоступен на порту 2999')
      console.log('💡 [MOCK WEBHOOK TEST] Запустите сервер командой: npm run dev или проверьте интеграционный тест')
      return false
    }

    console.log('✅ [MOCK WEBHOOK TEST] API сервер доступен')

    // Тест 1: Успешный callback
    console.log('\n=== ТЕСТ 1: УСПЕШНЫЙ CALLBACK ===')
    totalTests++

    const taskId1 = `mock-task-${Date.now()}-success`
    const jobId1 = createMockJob('144022504', taskId1)

    // Отправляем успешный callback
    const callbackSent1 = await sendWebhookCallback(taskId1, true)

    if (callbackSent1) {
      // Даём время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Проверяем обновление job
      const jobUpdated1 = checkJobStatus(jobId1, 'completed')
      if (jobUpdated1) {
        passedTests++
        console.log('✅ [MOCK WEBHOOK TEST] Тест 1 PASSED: Успешный callback обработан')
      } else {
        console.log('❌ [MOCK WEBHOOK TEST] Тест 1 FAILED: Job не обновился после callback')
      }
    } else {
      console.log('❌ [MOCK WEBHOOK TEST] Тест 1 FAILED: Callback не отправлен')
    }

    // Тест 2: Неудачный callback
    console.log('\n=== ТЕСТ 2: НЕУДАЧНЫЙ CALLBACK ===')
    totalTests++

    const taskId2 = `mock-task-${Date.now()}-failed`
    const jobId2 = createMockJob('144022505', taskId2)

    // Отправляем неудачный callback
    const callbackSent2 = await sendWebhookCallback(taskId2, false)

    if (callbackSent2) {
      // Даём время на обработку
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Проверяем обновление job
      const jobUpdated2 = checkJobStatus(jobId2, 'failed')
      if (jobUpdated2) {
        passedTests++
        console.log('✅ [MOCK WEBHOOK TEST] Тест 2 PASSED: Неудачный callback обработан')
      } else {
        console.log('❌ [MOCK WEBHOOK TEST] Тест 2 FAILED: Job не обновился после failed callback')
      }
    } else {
      console.log('❌ [MOCK WEBHOOK TEST] Тест 2 FAILED: Failed callback не отправлен')
    }

    // Тест 3: Callback для несуществующего taskId
    console.log('\n=== ТЕСТ 3: НЕСУЩЕСТВУЮЩИЙ TASKID ===')
    totalTests++

    const taskId3 = `mock-task-${Date.now()}-nonexistent`

    // Отправляем callback для несуществующего task
    const callbackSent3 = await sendWebhookCallback(taskId3, true)

    if (callbackSent3) {
      passedTests++
      console.log('✅ [MOCK WEBHOOK TEST] Тест 3 PASSED: Callback для несуществующего taskId обработан gracefully')
    } else {
      console.log('❌ [MOCK WEBHOOK TEST] Тест 3 FAILED: Callback для несуществующего taskId вызвал ошибку')
    }

    // Результаты
    console.log('\n=== РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ===')
    console.log(`📊 [MOCK WEBHOOK TEST] Пройдено: ${passedTests}/${totalTests}`)

    const stats = asyncLipSyncManager.getStats()
    console.log('📈 [MOCK WEBHOOK TEST] Статистика AsyncLipSyncManager:', stats)

    if (passedTests === totalTests) {
      console.log('🎉 [MOCK WEBHOOK TEST] ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!')
      return true
    } else {
      console.log('⚠️ [MOCK WEBHOOK TEST] Некоторые тесты не пройдены')
      return false
    }

  } catch (error) {
    console.error('💥 [MOCK WEBHOOK TEST] Критическая ошибка:', error)
    return false
  }
}

// Запуск при вызове напрямую
async function main() {
  try {
    const success = await testWebhookCallbacks()
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('💥 [MOCK WEBHOOK TEST] Фатальная ошибка:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { testWebhookCallbacks, createMockJob, sendWebhookCallback }