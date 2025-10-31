/**
 * Финальный тест webhook callback системы
 * Тестирует корректность обработки webhook callbacks через публичный API
 */

import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { logger } from '../src/utils/logger'

// Mock bot для тестирования
const mockBot = {
  telegram: {
    sendMessage: async (chatId: number, text: string, options?: any) => {
      console.log(`📱 [FINAL WEBHOOK TEST] Сообщение в чат ${chatId}:`)
      console.log(text)
      console.log('---')
      return { message_id: Date.now() }
    }
  }
}

/**
 * Тестирует webhook callback систему напрямую через API
 */
async function testWebhookDirectly() {
  console.log('🔍 [FINAL WEBHOOK TEST] Тестирование webhook callback API')

  // Устанавливаем mock bot
  asyncLipSyncManager.setBotInstance(mockBot)

  let passedTests = 0
  let totalTests = 0

  try {
    // Создаём mock job данные
    const mockTaskId1 = `direct-test-${Date.now()}-success`
    const mockTaskId2 = `direct-test-${Date.now()}-failed`

    // Создаём mock jobs напрямую в памяти для тестирования
    const testJob1 = {
      id: `test-job-1-${Date.now()}`,
      telegramId: '144022504',
      chatId: 144022504,
      startTime: Date.now(),
      input: {
        provider: 'kie' as const,
        modelId: 'veed-fabric' as const,
        imageUrl: 'https://example.com/test.jpg',
        text: 'Test text',
        resolution: '480p' as const
      },
      cost: 50.0,
      status: 'processing' as const,
      taskId: mockTaskId1,
      botInfo: { username: 'test-bot' }
    }

    const testJob2 = {
      id: `test-job-2-${Date.now()}`,
      telegramId: '144022505',
      chatId: 144022505,
      startTime: Date.now(),
      input: {
        provider: 'kie' as const,
        modelId: 'veed-fabric' as const,
        imageUrl: 'https://example.com/test.jpg',
        text: 'Test text',
        resolution: '480p' as const
      },
      cost: 75.0,
      status: 'processing' as const,
      taskId: mockTaskId2,
      botInfo: { username: 'test-bot' }
    }

    // Добавляем jobs через закрытый доступ для тестирования
    // @ts-ignore
    asyncLipSyncManager.jobs.set(testJob1.id, testJob1)
    // @ts-ignore
    asyncLipSyncManager.jobs.set(testJob2.id, testJob2)

    console.log('✅ [FINAL WEBHOOK TEST] Mock jobs созданы')
    console.log(`🆔 [FINAL WEBHOOK TEST] Job 1: ${testJob1.id} -> TaskId: ${mockTaskId1}`)
    console.log(`🆔 [FINAL WEBHOOK TEST] Job 2: ${testJob2.id} -> TaskId: ${mockTaskId2}`)

    // Тест 1: Успешный callback
    console.log('\n=== ТЕСТ 1: УСПЕШНЫЙ CALLBACK ===')
    totalTests++

    const successResult = {
      id: mockTaskId1,
      status: 'succeeded' as const,
      output: 'https://storage.googleapis.com/test_bucket/success_video.mp4',
      modelUsed: 'veed/fabric-1',
      costEstimate: 0.50,
      processingTime: 45.5,
      metadata: { test: 'success' }
    }

    const success1 = await asyncLipSyncManager.completeJobByTaskId(mockTaskId1, successResult)

    if (success1) {
      const updatedJob1 = asyncLipSyncManager.getJobStatus(testJob1.id)
      if (updatedJob1 && updatedJob1.status === 'completed') {
        passedTests++
        console.log('✅ [FINAL WEBHOOK TEST] Тест 1 PASSED: Успешный callback обработан корректно')
      } else {
        console.log('❌ [FINAL WEBHOOK TEST] Тест 1 FAILED: Job не обновился после успешного callback')
      }
    } else {
      console.log('❌ [FINAL WEBHOOK TEST] Тест 1 FAILED: completeJobByTaskId вернул false')
    }

    // Тест 2: Неудачный callback
    console.log('\n=== ТЕСТ 2: НЕУДАЧНЫЙ CALLBACK ===')
    totalTests++

    const errorResult = {
      message: 'Test error: Processing failed due to invalid input',
      error: 'Invalid image resolution',
      code: 'INVALID_INPUT',
      provider: 'kie' as const,
      modelId: 'veed-fabric'
    }

    const success2 = await asyncLipSyncManager.completeJobByTaskId(mockTaskId2, errorResult)

    if (success2) {
      const updatedJob2 = asyncLipSyncManager.getJobStatus(testJob2.id)
      if (updatedJob2 && updatedJob2.status === 'failed') {
        passedTests++
        console.log('✅ [FINAL WEBHOOK TEST] Тест 2 PASSED: Неудачный callback обработан корректно')
      } else {
        console.log('❌ [FINAL WEBHOOK TEST] Тест 2 FAILED: Job не обновился после неудачного callback')
      }
    } else {
      console.log('❌ [FINAL WEBHOOK TEST] Тест 2 FAILED: completeJobByTaskId вернул false для ошибки')
    }

    // Тест 3: Callback для несуществующего taskId
    console.log('\n=== ТЕСТ 3: НЕСУЩЕСТВУЮЩИЙ TASKID ===')
    totalTests++

    const nonExistentTaskId = `non-existent-${Date.now()}`
    const success3 = await asyncLipSyncManager.completeJobByTaskId(nonExistentTaskId, successResult)

    if (!success3) {
      passedTests++
      console.log('✅ [FINAL WEBHOOK TEST] Тест 3 PASSED: Несуществующий taskId корректно отклонён')
    } else {
      console.log('❌ [FINAL WEBHOOK TEST] Тест 3 FAILED: Несуществующий taskId принят (не должно быть)')
    }

    // Тест 4: Проверка корректности поиска по taskId
    console.log('\n=== ТЕСТ 4: ПОИСК ПО TASKID ===')
    totalTests++

    const foundJob1 = asyncLipSyncManager.getJobByTaskId(mockTaskId1)
    const foundJob2 = asyncLipSyncManager.getJobByTaskId(mockTaskId2)
    const notFoundJob = asyncLipSyncManager.getJobByTaskId('non-existent-task')

    if (foundJob1 && foundJob1.id === testJob1.id &&
        foundJob2 && foundJob2.id === testJob2.id &&
        !notFoundJob) {
      passedTests++
      console.log('✅ [FINAL WEBHOOK TEST] Тест 4 PASSED: Поиск по taskId работает корректно')
    } else {
      console.log('❌ [FINAL WEBHOOK TEST] Тест 4 FAILED: Проблемы с поиском по taskId')
      console.log(`  Found job 1: ${foundJob1?.id}, expected: ${testJob1.id}`)
      console.log(`  Found job 2: ${foundJob2?.id}, expected: ${testJob2.id}`)
      console.log(`  Not found job: ${notFoundJob ? 'FOUND (WRONG)' : 'NULL (CORRECT)'}`)
    }

    // Результаты
    console.log('\n=== РЕЗУЛЬТАТЫ ФИНАЛЬНОГО ТЕСТИРОВАНИЯ ===')
    console.log(`📊 [FINAL WEBHOOK TEST] Пройдено: ${passedTests}/${totalTests}`)

    const stats = asyncLipSyncManager.getStats()
    console.log('📈 [FINAL WEBHOOK TEST] Статистика AsyncLipSyncManager:', stats)

    if (passedTests === totalTests) {
      console.log('🎉 [FINAL WEBHOOK TEST] ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!')
      console.log('✅ [FINAL WEBHOOK TEST] Webhook callback система работает корректно')
      return true
    } else {
      console.log('⚠️ [FINAL WEBHOOK TEST] Некоторые тесты не пройдены')
      return false
    }

  } catch (error) {
    console.error('💥 [FINAL WEBHOOK TEST] Критическая ошибка:', error)
    return false
  }
}

/**
 * Тестирует setTaskId и getJobByTaskId функции
 */
async function testTaskIdFunctions() {
  console.log('\n🔧 [FINAL WEBHOOK TEST] Тестирование функций taskId')

  // Создаём тестовый job
  const testJob = {
    id: `taskid-test-${Date.now()}`,
    telegramId: '123456789',
    chatId: 123456789,
    startTime: Date.now(),
    input: {
      provider: 'kie' as const,
      modelId: 'veed-fabric' as const,
      imageUrl: 'https://example.com/test.jpg',
      text: 'Test',
      resolution: '480p' as const
    },
    cost: 25.0,
    status: 'processing' as const,
    botInfo: { username: 'test' }
  }

  // @ts-ignore
  asyncLipSyncManager.jobs.set(testJob.id, testJob)

  const testTaskId = `taskid-test-${Date.now()}`

  // Тест setTaskId
  const setResult = asyncLipSyncManager.setTaskId(testJob.id, testTaskId)
  console.log(`🔗 [FINAL WEBHOOK TEST] setTaskId result: ${setResult}`)

  // Тест getJobByTaskId
  const foundJob = asyncLipSyncManager.getJobByTaskId(testTaskId)
  console.log(`🔍 [FINAL WEBHOOK TEST] getJobByTaskId result: ${foundJob ? 'FOUND' : 'NOT FOUND'}`)

  if (setResult && foundJob && foundJob.id === testJob.id) {
    console.log('✅ [FINAL WEBHOOK TEST] TaskId функции работают корректно')
    return true
  } else {
    console.log('❌ [FINAL WEBHOOK TEST] Проблемы с TaskId функциями')
    return false
  }
}

/**
 * Главная функция тестирования
 */
async function runFinalWebhookTest() {
  console.log('🚀 [FINAL WEBHOOK TEST] Запуск финального тестирования webhook системы')

  try {
    // Тест функций taskId
    const taskIdTest = await testTaskIdFunctions()

    // Тест webhook callbacks
    const webhookTest = await testWebhookDirectly()

    console.log('\n=== ИТОГОВЫЕ РЕЗУЛЬТАТЫ ===')
    console.log(`🔧 [FINAL WEBHOOK TEST] TaskId функции: ${taskIdTest ? 'PASSED' : 'FAILED'}`)
    console.log(`🔗 [FINAL WEBHOOK TEST] Webhook callbacks: ${webhookTest ? 'PASSED' : 'FAILED'}`)

    if (taskIdTest && webhookTest) {
      console.log('🎉 [FINAL WEBHOOK TEST] СИСТЕМА ГОТОВА К ПРОДАКШЕНУ!')
      return true
    } else {
      console.log('⚠️ [FINAL WEBHOOK TEST] Требуется доработка перед продакшеном')
      return false
    }

  } catch (error) {
    console.error('💥 [FINAL WEBHOOK TEST] Фатальная ошибка:', error)
    return false
  }
}

// Запуск при вызове напрямую
async function main() {
  try {
    const success = await runFinalWebhookTest()
    process.exit(success ? 0 : 1)
  } catch (error) {
    console.error('💥 [FINAL WEBHOOK TEST] Критическая ошибка:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { runFinalWebhookTest, testWebhookDirectly, testTaskIdFunctions }