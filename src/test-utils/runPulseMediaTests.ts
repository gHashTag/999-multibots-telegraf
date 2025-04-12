import { logger } from '@/utils/logger'
import { runAllPulseMediaTests } from './tests/pulse/pulseMediaTest'
import { TestResult } from './types'
import { runTests } from './runTests'

/**
 * Запускает все тесты для Pulse
 */
export async function runPulseTests(): Promise<TestResult[]> {
  logger.info({
    message: '🚀 Запуск всех тестов для Pulse',
    description: 'Running all Pulse tests',
  })

  try {
    // Запускаем все тесты Pulse
    const results = await runTests([runAllPulseMediaTests])

    // Подсчитываем количество успешных и неуспешных тестов
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    logger.info({
      message: `🏁 Завершены все тесты для Pulse: ✅ ${successCount} успешных, ❌ ${failCount} неуспешных`,
      description: `All Pulse tests completed: ${successCount} successful, ${failCount} failed`,
    })

    return results
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов Pulse',
      description: 'Error running Pulse tests',
      error: (error as Error).message,
      stack: (error as Error).stack,
    })

    return [
      {
        success: false,
        message: `Ошибка при запуске тестов: ${(error as Error).message}`,
        name: 'Тесты Pulse',
      },
    ]
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    await runPulseTests()
  })()
}
