import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

/**
 * Тест успешного сценария с публичными URL
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

async function testSuccessScenario() {
  console.log('🚀 [TEST] Тест успешного сценария с публичными URL')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Используем публичные URL, которые точно работают
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://images.unsplash.com/photo-1494790108755-2616c6a32432?w=400&h=400&fit=crop&crop=face', // Публичное изображение лица
      '', // Пустой текст - используем audioUrl
      '144022504',
      {
        botName: 'test_bot',
        resolution: '480p', // Используем 480p для быстрой генерации
        isAudioUrl: true, // Указываем что используем URL аудио
        audioUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav' // Публичный аудиофайл
      }
    )

    // Устанавливаем audioUrl напрямую (обходим проверку текста)
    testInput.audioUrl = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav'

    console.log('📝 [TEST] Создан тестовый input с публичными URL:', {
      provider: testInput.provider,
      modelId: testInput.modelId,
      imageUrl: testInput.imageUrl,
      audioUrl: testInput.audioUrl,
      resolution: '480p'
    })

    // Запускаем асинхронную генерацию
    const jobId = await asyncLipSyncManager.startAsyncGeneration(
      testInput,
      15, // Меньшая стоимость для 480p
      '144022504',
      144022504,
      { username: 'test_bot' }
    )

    console.log(`🆔 [TEST] Создана задача: ${jobId}`)

    // Быстрая проверка статуса
    setTimeout(() => {
      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (jobStatus) {
        console.log(`📊 [TEST] Статус через 10 сек: ${jobStatus.status}`)
      }
    }, 10000)

    console.log('✅ [TEST] Асинхронная задача запущена успешно!')
    console.log('⏰ [TEST] Мониторинг продолжается в фоне...')

  } catch (error) {
    console.error('❌ [TEST] Ошибка в тесте:', error)
  }
}

// Запускаем тест
if (require.main === module) {
  testSuccessScenario()
    .then(() => {
      console.log('🏁 [TEST] Тест инициализации завершен')

      // Не завершаем процесс, чтобы дать время асинхронной задаче
      console.log('⏳ [TEST] Ожидание завершения асинхронной задачи...')
      setTimeout(() => {
        const stats = asyncLipSyncManager.getStats()
        console.log('📊 [TEST] Финальная статистика:', stats)
        process.exit(0)
      }, 60000) // 1 минута на выполнение
    })
    .catch(error => {
      console.error('💥 [TEST] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { testSuccessScenario }