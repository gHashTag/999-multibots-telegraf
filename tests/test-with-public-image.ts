import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

/**
 * Тест с публично доступным изображением (не из Supabase)
 * Для проверки что система работает с правильными URL
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

async function testWithPublicImage() {
  console.log('🔍 [PUBLIC TEST] Тест с публично доступным изображением')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Используем публично доступное изображение лица (не из Supabase)
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://images.unsplash.com/photo-1494790108755-2616c6a32432?w=500&h=500&fit=crop&crop=face&auto=format', // Публичное изображение лица
      'Тест с публичным изображением', // Короткий текст
      '144022504',
      {
        botName: 'public_test',
        resolution: '480p',
        isAudioUrl: false,
      }
    )

    console.log('📝 [PUBLIC TEST] Создан тестовый input:', {
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
      { username: 'public_test' }
    )

    console.log(`🆔 [PUBLIC TEST] Создана тестовая задача: ${jobId}`)

    // Следим за выполнением
    let attempts = 0
    const maxAttempts = 120 // 10 минут

    while (attempts < maxAttempts) {
      attempts++

      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (!jobStatus) {
        console.log('❌ [PUBLIC TEST] Задача не найдена')
        break
      }

      console.log(`⏳ [PUBLIC TEST] Проверка #${attempts}/${maxAttempts} - Статус: ${jobStatus.status}`)

      if (jobStatus.status === 'completed') {
        console.log('✅ [PUBLIC TEST] УСПЕХ! Генерация завершена!')
        console.log('📦 [PUBLIC TEST] Результат:', {
          hasId: jobStatus.result && 'id' in jobStatus.result,
          output: jobStatus.result && 'output' in jobStatus.result ?
            (jobStatus.result as any).output : undefined,
          processingTime: Date.now() - jobStatus.startTime,
        })
        break
      } else if (jobStatus.status === 'failed') {
        console.log('❌ [PUBLIC TEST] Задача завершена с ошибкой!')
        console.log('📦 [PUBLIC TEST] Детали ошибки:', {
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
      console.log('⏰ [PUBLIC TEST] Достигнут таймаут')
    }

    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [PUBLIC TEST] Статистика:', stats)

  } catch (error) {
    console.error('💥 [PUBLIC TEST] Критическая ошибка:', error)
  }
}

// Запускаем тест с публичным изображением
if (require.main === module) {
  testWithPublicImage()
    .then(() => {
      console.log('🏁 [PUBLIC TEST] Тест с публичным изображением завершен')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 [PUBLIC TEST] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { testWithPublicImage }