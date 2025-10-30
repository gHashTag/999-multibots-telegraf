import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

/**
 * Диагностический тест с максимально детальными логами
 * Поможет выяснить, на каком этапе происходит ошибка
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

async function runDiagnosticTest() {
  console.log('🔍 [DIAGNOSTIC] Запуск диагностического теста с детальными логами')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Используем простое изображение из Supabase (которое точно доступно)
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-images/144022504/1760511204459.jpg',
      'Тест диагностики',
      '144022504',
      {
        botName: 'diagnostic_test',
        resolution: '480p', // Используем более быстрое разрешение
        isAudioUrl: false, // Используем текст, а не аудио URL
      }
    )

    console.log('📝 [DIAGNOSTIC] Создан тестовый input:', {
      provider: testInput.provider,
      modelId: testInput.modelId,
      imageUrl: testInput.imageUrl,
      textLength: testInput.text?.length,
      resolution: '480p',
    })

    // Запускаем асинхронную генерацию
    const jobId = await asyncLipSyncManager.startAsyncGeneration(
      testInput,
      20, // Стоимость для 480p
      '144022504',
      144022504,
      { username: 'diagnostic_test' }
    )

    console.log(`🆔 [DIAGNOSTIC] Создана диагностическая задача: ${jobId}`)

    // Следим за выполнением
    let attempts = 0
    const maxAttempts = 120 // 10 минут максимум (5 сек * 120)

    while (attempts < maxAttempts) {
      attempts++

      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (!jobStatus) {
        console.log('❌ [DIAGNOSTIC] Задача не найдена')
        break
      }

      console.log(`⏳ [DIAGNOSTIC] Проверка #${attempts}/${maxAttempts} - Статус: ${jobStatus.status}`)

      if (jobStatus.status === 'completed') {
        console.log('✅ [DIAGNOSTIC] Задача завершена успешно!')
        console.log('📦 [DIAGNOSTIC] Результат:', {
          hasId: jobStatus.result && 'id' in jobStatus.result,
          output: jobStatus.result && 'output' in jobStatus.result ?
            (jobStatus.result as any).output : undefined,
          processingTime: Date.now() - jobStatus.startTime,
        })
        break
      } else if (jobStatus.status === 'failed') {
        console.log('❌ [DIAGNOSTIC] Задача завершена с ошибкой!')
        console.log('📦 [DIAGNOSTIC] Детали ошибки:', {
          message: jobStatus.result && 'message' in jobStatus.result ?
            (jobStatus.result as any).message : undefined,
          error: jobStatus.result && 'error' in jobStatus.result ?
            (jobStatus.result as any).error : undefined,
          code: jobStatus.result && 'code' in jobStatus.result ?
            (jobStatus.result as any).code : undefined,
          provider: jobStatus.result && 'provider' in jobStatus.result ?
            (jobStatus.result as any).provider : undefined,
          processingTime: Date.now() - jobStatus.startTime,
          fullResult: jobStatus.result,
        })
        break
      }

      // Ждем 5 секунд
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    if (attempts >= maxAttempts) {
      console.log('⏰ [DIAGNOSTIC] Достигнут таймаут')
    }

    // Показываем финальную статистику
    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [DIAGNOSTIC] Финальная статистика:', stats)

  } catch (error) {
    console.error('💥 [DIAGNOSTIC] Критическая ошибка в тесте:', error)
  }
}

// Запускаем диагностический тест
if (require.main === module) {
  runDiagnosticTest()
    .then(() => {
      console.log('🏁 [DIAGNOSTIC] Диагностический тест завершен')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 [DIAGNOSTIC] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { runDiagnosticTest }