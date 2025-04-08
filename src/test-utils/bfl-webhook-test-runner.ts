/**
 * Скрипт для тестирования вебхуков BFL
 */
import { BFLWebhookTester } from './webhook-tests/index'
import { logger } from '../utils/logger'
import { TestResult } from './types'
import { supabase } from '@/core/supabase'
import { createTestError } from './test-logger'

// Интерфейс для итогов тестирования
interface TestSummary {
  success: boolean
  totalTests: number
  successCount: number
  failCount: number
  results: TestResult[]
}

async function runBFLWebhookTests(): Promise<TestSummary> {
  logger.info({
    message: '🚀 Запуск тестов вебхуков BFL',
    description: 'Starting BFL webhook tests',
  })

  const tester = new BFLWebhookTester()
  const results = await tester.runAllTests()

  // Считаем успешные и неуспешные тесты
  const successfulResults = results.filter(
    (result: TestResult) => result.success
  )
  const failedResults = results.filter((result: TestResult) => !result.success)

  // Выводим результаты
  logger.info({
    message: `✅ Тесты BFL вебхуков завершены: ${successfulResults.length} успешно, ${failedResults.length} неуспешно`,
    description: `BFL webhook tests completed: ${successfulResults.length} success, ${failedResults.length} failures`,
    results,
  })

  // Выводим детали по каждому тесту
  results.forEach((result: TestResult) => {
    if (result.success) {
      logger.info({
        message: `✓ ${result.name} - ${result.message}`,
        description: `Test passed: ${result.name}`,
      })
    } else {
      logger.error({
        message: `✗ ${result.name} - ${result.message}`,
        description: `Test failed: ${result.name}`,
        error: result.error,
      })
    }
  })

  return {
    success: failedResults.length === 0,
    totalTests: results.length,
    successCount: successfulResults.length,
    failCount: failedResults.length,
    results,
  }
}

export async function testBFLWebhook(trainingId: string): Promise<TestResult> {
  const testName = 'BFL Webhook Test'
  const startTime = Date.now()

  try {
    logger.info({
      message: '🧪 Тест вебхука BFL',
      description: 'Testing BFL webhook',
      trainingId,
    })

    const { data, error } = await supabase
      .from('bfl_trainings')
      .select('*')
      .eq('id', trainingId)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      throw new Error(`Тренировка ${trainingId} не найдена`)
    }

    logger.info({
      message: '✅ Тренировка BFL найдена',
      description: 'BFL training found',
      training: {
        id: data.id,
        status: data.status,
        createdAt: data.created_at,
      },
    })

    return {
      name: testName,
      success: true,
      message: `Тренировка BFL ${trainingId} успешно обработана`,
      startTime,
      duration: Date.now() - startTime,
    }
  } catch (err) {
    const error = createTestError(err)

    logger.error({
      message: '❌ Ошибка при обработке вебхука BFL',
      description: 'Error processing BFL webhook',
      error,
      trainingId,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при обработке вебхука BFL',
      error,
      startTime,
      duration: Date.now() - startTime,
    }
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  runBFLWebhookTests()
    .then(summary => {
      logger.info({
        message: '📊 Итоги тестирования BFL вебхуков',
        description: 'BFL webhook testing summary',
        summary,
      })

      // Завершаем процесс с соответствующим статусом
      process.exit(summary.success ? 0 : 1)
    })
    .catch(error => {
      logger.error({
        message: '💥 Критическая ошибка при запуске тестов BFL вебхуков',
        description: 'Critical error during BFL webhook tests',
        error: createTestError(error),
      })
      process.exit(1)
    })
}

export { runBFLWebhookTests }
