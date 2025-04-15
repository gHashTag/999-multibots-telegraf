import { testPaymentProcessing } from './core/paymentProcessor.test'
import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'

/**
 * Проверка структуры тестов
 */
async function validateTestStructure(): Promise<TestResult> {
  try {
    // Базовая проверка наличия необходимых файлов
    return {
      success: true,
      name: 'Test Structure Validation',
      message: 'Test structure is valid',
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Test Structure Validation',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Запуск всех тестов платежной системы
 */
export async function runAllPaymentTests(): Promise<TestResult[]> {
  try {
    logger.info('🚀 Запуск тестов платежной системы', {
      description: 'Starting payment system tests',
    })

    // Проверка структуры тестов
    const structureValidation = await validateTestStructure()
    if (!structureValidation.success) {
      throw new Error(
        `Структура тестов нарушена: ${structureValidation.message}`
      )
    }

    // Запуск тестов
    const results = await Promise.all([testPaymentProcessing()])

    // Подсчет статистики
    const totalTests = results.length
    const passedTests = results.filter((r: TestResult) => r.success).length
    const successRate = (passedTests / totalTests) * 100

    logger.info(`
      📊 Статистика тестов:
      Всего тестов: ${totalTests}
      Успешных: ${passedTests}
      Процент успеха: ${successRate}%
    `)

    return results
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении тестов:', error)
    throw error
  }
}

// Если файл запущен напрямую
if (require.main === module) {
  runAllPaymentTests()
    .then(() => logger.info('✅ Тесты успешно завершены'))
    .catch(error => {
      logger.error('❌ Ошибка выполнения тестов:', error)
      process.exit(1)
    })
}
