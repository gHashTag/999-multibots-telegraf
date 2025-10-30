import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'
import { logger } from '../src/utils/logger'

/**
 * Тест асинхронного LipSync менеджера
 * Проверяет корректность обработки результатов от Kie.ai
 */

interface MockBot {
  telegram: {
    sendMessage: (chatId: number, text: string, options?: any) => Promise<void>
  }
}

const mockBot: MockBot = {
  telegram: {
    sendMessage: async (chatId: number, text: string, options?: any) => {
      console.log(`📱 [MOCK BOT] Сообщение в чат ${chatId}:`)
      console.log(text)
      console.log('---')
    }
  }
}

async function testAsyncLipSyncManager() {
  console.log('🚀 [TEST] Запуск теста асинхронного LipSync менеджера')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Создаем тестовый input для Veed Fabric
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-images/144022504/1760511204459.jpg', // Пример изображения
      'Привет, это тест асинхронной генерации!', // Тестовый текст
      '144022504', // Тестовый telegram ID
      {
        botName: 'test_bot',
        resolution: '720p',
        isAudioUrl: false,
      }
    )

    console.log('📝 [TEST] Создан тестовый input:', {
      provider: testInput.provider,
      modelId: testInput.modelId,
      imageUrl: testInput.imageUrl.substring(0, 50) + '...',
      textLength: testInput.text?.length,
    })

    // Запускаем асинхронную генерацию
    const jobId = await asyncLipSyncManager.startAsyncGeneration(
      testInput,
      28, // Тестовая стоимость
      '144022504',
      144022504, // chat ID
      { username: 'test_bot' }
    )

    console.log(`🆔 [TEST] Создана задача: ${jobId}`)

    // Мониторим выполнение
    let attempts = 0
    const maxAttempts = 60 // 5 минут максимум

    while (attempts < maxAttempts) {
      attempts++

      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (!jobStatus) {
        console.log('❌ [TEST] Задача не найдена')
        break
      }

      console.log(`⏳ [TEST] Проверка #${attempts} - Статус: ${jobStatus.status}`)

      if (jobStatus.status === 'completed') {
        console.log('✅ [TEST] Задача завершена успешно!')
        console.log('📦 [TEST] Результат:', {
          hasId: jobStatus.result && 'id' in jobStatus.result,
          output: jobStatus.result && 'output' in jobStatus.result ?
            (jobStatus.result as any).output : undefined,
          processingTime: Date.now() - jobStatus.startTime,
        })
        break
      } else if (jobStatus.status === 'failed') {
        console.log('❌ [TEST] Задача завершена с ошибкой!')
        console.log('📦 [TEST] Ошибка:', {
          message: jobStatus.result && 'message' in jobStatus.result ?
            (jobStatus.result as any).message : undefined,
          code: jobStatus.result && 'code' in jobStatus.result ?
            (jobStatus.result as any).code : undefined,
          processingTime: Date.now() - jobStatus.startTime,
        })
        break
      }

      // Ждем 5 секунд
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    if (attempts >= maxAttempts) {
      console.log('⏰ [TEST] Достигнут таймаут')
    }

    // Показываем статистику менеджера
    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [TEST] Статистика менеджера:', stats)

  } catch (error) {
    console.error('❌ [TEST] Ошибка в тесте:', error)
  }
}

// Запускаем тест, если файл выполняется напрямую
if (require.main === module) {
  testAsyncLipSyncManager()
    .then(() => {
      console.log('🏁 [TEST] Тест завершен')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 [TEST] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { testAsyncLipSyncManager }