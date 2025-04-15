import { logger } from '@/utils/logger'
import { TestResult } from '../../types'
import { paymentCoreTests } from './core'
import { paymentFeatureTests } from './features'
import { paymentIntegrationTests } from './integrations'
import { validateTestStructure } from './utils/validateStructure'

/**
 * Запуск всех тестов платежной системы
 */
export async function runAllPaymentTests(
  options = { verbose: true }
): Promise<TestResult[]> {
  const results: TestResult[] = []

  logger.info('🚀 Запуск всех тестов платежной системы...')

  try {
    // Проверяем структуру тестов
    const structureValidation = validateTestStructure()
    if (!structureValidation.isValid) {
      throw new Error(
        'Структура тестов нарушена:\n' + structureValidation.errors.join('\n')
      )
    }

    // Core tests - тестирование платежного процессора
    logger.info('⚙️ Запуск core тестов...')
    const coreResults = await Promise.all([
      paymentCoreTests.testPaymentProcessor(),
    ])
    results.push(...coreResults)

    // Feature tests - тестирование баланса
    logger.info('⭐ Запуск feature тестов...')
    const featureResults = await Promise.all([
      paymentFeatureTests.testBalance(),
    ])
    results.push(...featureResults)

    // Integration tests - тестирование Robokassa
    logger.info('🔌 Запуск integration тестов...')
    const integrationResults = await Promise.all([
      paymentIntegrationTests.testRobokassa(),
    ])
    results.push(...integrationResults)

    const failed = results.filter(r => !r.success)
    const total = results.length
    const passed = total - failed.length

    logger.info('📊 Статистика тестов:', {
      total,
      passed,
      failed: failed.length,
      successRate: `${((passed / total) * 100).toFixed(2)}%`,
    })

    if (options.verbose) {
      logger.info('📝 Детальные результаты:', results)
    }

    return results
  } catch (error) {
    logger.error(
      '❌ Ошибка при выполнении тестов:',
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

// Запуск тестов если файл вызван напрямую
if (require.main === module) {
  runAllPaymentTests()
    .then(results => {
      const failed = results.filter(r => !r.success)
      if (failed.length) {
        logger.error('❌ Некоторые тесты не прошли:', failed)
        process.exit(1)
      }
      logger.info('✅ Все тесты успешно пройдены!')
      process.exit(0)
    })
    .catch(error => {
      logger.error('❌ Ошибка выполнения тестов:', error)
      process.exit(1)
    })
}
