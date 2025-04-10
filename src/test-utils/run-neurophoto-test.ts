import { testNeuroPhotoGeneration } from './tests/neuroPhoto.test'
import { Logger } from '@/utils/logger'

/**
 * Функция для запуска теста генерации нейрофото
 * Обрабатывает результат теста и выводит информацию о выполнении
 */
async function runNeurophotoTest(): Promise<void> {
  try {
    Logger.info('🚀 Запуск теста нейрофото', {
      description: 'Starting neurophoto test',
    })

    const result = await testNeuroPhotoGeneration()

    if (result.success) {
      Logger.info(`✅ Тест успешно пройден: ${result.name}`, {
        description: 'Test passed successfully',
        message: result.message,
        details: result.details || {},
      })
    } else {
      Logger.error(`❌ Тест не пройден: ${result.name}`, {
        description: 'Test failed',
        message: result.message || '',
        error: result.error || 'Неизвестная ошибка',
      })
      process.exit(1)
    }
  } catch (error) {
    Logger.error('❌ Критическая ошибка при выполнении теста', {
      description: 'Critical error during test execution',
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Запускаем тест
runNeurophotoTest()
