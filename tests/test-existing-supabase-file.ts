import { asyncLipSyncManager } from '../src/core/lipsync/async-lipsync-manager'
import { LipSyncInputBuilder } from '../src/core/lipsync/schemas/lipsync-schemas'

/**
 * Тест с РЕАЛЬНО СУЩЕСТВУЮЩИМ файлом из Supabase Storage
 * Используем файл lipsync-images/144022504/1760514009568.jpg который точно существует
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

async function testExistingSupabaseFile() {
  console.log('🚀 [SUPABASE TEST] Тест с реально существующим файлом из Supabase')

  try {
    // Устанавливаем мок бота
    asyncLipSyncManager.setBotInstance(mockBot as any)

    // Используем РЕАЛЬНО существующий файл из Supabase Storage
    const testInput = LipSyncInputBuilder.forVeedFabric(
      'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/lipsync-images/144022504/1760514009568.jpg', // РЕАЛЬНЫЙ файл
      'Supabase test message', // Простой текст для генерации аудио
      '144022504',
      {
        botName: 'supabase_test',
        resolution: '480p',
        isAudioUrl: false,
      }
    )

    console.log('📝 [SUPABASE TEST] Создан тестовый input с РЕАЛЬНЫМ Supabase URL:', {
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
      { username: 'supabase_test' }
    )

    console.log(`🆔 [SUPABASE TEST] Создана задача: ${jobId}`)

    // Мониторим выполнение с более длительным ожиданием
    let attempts = 0
    const maxAttempts = 80 // 6.5 минут

    while (attempts < maxAttempts) {
      attempts++

      const jobStatus = asyncLipSyncManager.getJobStatus(jobId)
      if (!jobStatus) {
        console.log('❌ [SUPABASE TEST] Задача не найдена')
        break
      }

      console.log(`⏳ [SUPABASE TEST] Проверка #${attempts}/${maxAttempts} - Статус: ${jobStatus.status}`)

      if (jobStatus.status === 'completed') {
        console.log('🎉 [SUPABASE TEST] УСПЕХ! Генерация завершена с Supabase файлом!')
        console.log('📦 [SUPABASE TEST] Результат:', {
          hasId: jobStatus.result && 'id' in jobStatus.result,
          output: jobStatus.result && 'output' in jobStatus.result ?
            (jobStatus.result as any).output : undefined,
          processingTime: Math.round((Date.now() - jobStatus.startTime) / 1000),
        })
        break
      } else if (jobStatus.status === 'failed') {
        console.log('❌ [SUPABASE TEST] Задача завершена с ошибкой!')
        console.log('📦 [SUPABASE TEST] Детали ошибки:', {
          message: jobStatus.result && 'message' in jobStatus.result ?
            (jobStatus.result as any).message : undefined,
          error: jobStatus.result && 'error' in jobStatus.result ?
            (jobStatus.result as any).error : undefined,
          code: jobStatus.result && 'code' in jobStatus.result ?
            (jobStatus.result as any).code : undefined,
          processingTime: Math.round((Date.now() - jobStatus.startTime) / 1000),
        })
        break
      }

      // Ждем 5 секунд
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    if (attempts >= maxAttempts) {
      console.log('⏰ [SUPABASE TEST] Достигнут таймаут')
    }

    const stats = asyncLipSyncManager.getStats()
    console.log('📊 [SUPABASE TEST] Статистика:', stats)

  } catch (error) {
    console.error('💥 [SUPABASE TEST] Критическая ошибка:', error)
  }
}

// Запускаем тест
if (require.main === module) {
  testExistingSupabaseFile()
    .then(() => {
      console.log('🏁 [SUPABASE TEST] Тест с реальным Supabase файлом завершен')
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 [SUPABASE TEST] Критическая ошибка:', error)
      process.exit(1)
    })
}

export { testExistingSupabaseFile }