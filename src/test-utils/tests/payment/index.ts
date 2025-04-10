import { logger } from '@/utils/logger'
import { runPaymentProcessorTests } from './paymentProcessorTest'
import { runRuPaymentTests } from './ruPaymentTest'

/**
 * Запускает все тесты для платежных функций
 * @param options Опции запуска тестов
 * @returns Результаты выполнения тестов
 */
export async function runPaymentTests(options: { verbose?: boolean } = {}): Promise<any> {
  logger.info('🚀 Запуск тестов платежных функций...', {
    description: 'Starting Payment Function Tests...',
  })

  const startTime = Date.now()
  const results = []

  try {
    // Запуск тестов Payment Processor
    logger.info('🔄 Запуск тестов Payment Processor', {
      description: 'Running Payment Processor tests',
    })

    const paymentProcessorResults = await runPaymentProcessorTests(options)
    results.push({
      name: 'Payment Processor',
      success: paymentProcessorResults.success,
      results: paymentProcessorResults.results,
    })

    // Запуск тестов RU Payment Service
    logger.info('🔄 Запуск тестов RU Payment Service', {
      description: 'Running RU Payment Service tests',
    })

    const ruPaymentResults = await runRuPaymentTests(options)
    results.push({
      name: 'RU Payment Service',
      success: ruPaymentResults.success,
      results: ruPaymentResults.results,
    })

    const endTime = Date.now()
    const duration = endTime - startTime
    const successCount = results.filter(r => r.success).length
    const totalCount = results.length

    logger.info('✅ Тесты платежных функций завершены', {
      description: 'Payment function tests completed',
      duration,
      successCount,
      totalCount,
    })

    return {
      success: successCount === totalCount,
      results,
      stats: {
        duration,
        successCount,
        totalCount,
      }
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime

    logger.error('❌ Ошибка при выполнении тестов платежных функций', {
      description: 'Error running payment function tests',
      error: error instanceof Error ? error.message : String(error),
      duration,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      results,
      stats: {
        duration,
        successCount: results.filter(r => r.success).length,
        totalCount: results.length,
      }
    }
  }
} 