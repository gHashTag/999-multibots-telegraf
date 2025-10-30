import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

/**
 * Тест с максимально надежным публичным изображением
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

async function testReliableImage() {
  console.log('🚀 [RELIABLE TEST] Тест с надежным публичным изображением')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Используем GitHub Avatar (очень надежный URL)
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://avatars.githubusercontent.com/u/1?v=4', // GitHub avatar - всегда доступен
      'Hello world test', // Простой текст
      '144022504',
      {
        botName: 'reliable_test',
        resolution: '480p',
        isAudioUrl: false,
      }
    )

    console.log('📝 [RELIABLE TEST] Создан тестовый input с надежным URL:', {
      provider: testInput.provider,
      modelId: testInput.modelId,
      imageUrl: testInput.imageUrl,
      textLength: testInput.text?.length,
      resolution: '480p',
    })

    // Запускаем асинхронную генерацию
    const jobId = await asyncLipSyncManager.startAsyncGeneration(
      testInput,
      20,
      '144022504',
      144022504,
      { username: 'reliable_test' }
    )

    console.log(`🆔 [RELIABLE TEST] Создана задача: ${jobId}`)

    // Мониторим выполнение
    let attempts = 0
    const maxAttempts = 60 // 5 минут

    while (attempts < maxAttempts) {
      attempts++

      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (!jobStatus) {
        console.log('❌ [RELIABLE TEST] Задача не найдена')
        break
      }

      console.log(`⏳ [RELIABLE TEST] Проверка #${attempts}/${maxAttempts} - Статус: ${jobStatus.status}`)

      if (jobStatus.status === 'completed') {
        console.log('✅ [RELIABLE TEST] УСПЕХ! Генерация завершена!')
        console.log('📦 [RELIABLE TEST] Результат:', {
          hasId: jobStatus.result && 'id' in jobStatus.result,
          output: jobStatus.result && 'output' in jobStatus.result ?
            (jobStatus.result as any).output : undefined,
          processingTime: Date.now() - jobStatus.startTime,
        })
        break
      } else if (jobStatus.status === 'failed') {
        console.log('❌ [RELIABLE TEST] Задача завершена с ошибкой!')
        console.log('📦 [RELIABLE TEST] Детали ошибки:', {
          message: jobStatus.result && 'message' in jobStatus.result ?
            (jobStatus.result as any).message : undefined,
          error: jobStatus.result && 'error' in jobStatus.result ?
            (jobStatus.result as any).error : undefined,
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
      console.log('⏰ [RELIABLE TEST] Достигнут таймаут')
    }

    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [RELIABLE TEST] Статистика:', stats)

  } catch (error) {
    console.error('💥 [RELIABLE TEST] Критическая ошибка:', error)
  }
}

// Запускаем тест
if (require.main === module) {
  testReliableImage()
    .then(() => {
      console.log('🏁 [RELIABLE TEST] Тест завершен')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 [RELIABLE TEST] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { testReliableImage }