import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { runNeuroPhotoTests } from './neuroPhotoTest'

/**
 * Запускает все тесты для Inngest функций
 */
export async function runInngestTests(verbose = false): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов Inngest функций', { description: 'Starting Inngest function tests' })
  
  const results: TestResult[] = []
  
  // Тестирование функций нейрофото
  results.push(...await runNeuroPhotoTests())
  
  // Здесь можно добавить другие тесты для Inngest функций
  
  // Выводим результаты
  logger.info({
    message: '📊 Результаты тестов Inngest функций',
    description: 'Inngest function tests results',
    success: results.every(r => r.success),
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  })
  
  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runInngestTests(true).then(results => {
    logger.info({
      message: '📊 Результаты тестов Inngest функций',
      description: 'Inngest function tests results',
      success: results.every((r: TestResult) => r.success),
      testName: 'Inngest Tests Suite',
      details: results.map((r: TestResult) => ({
        testName: r.name,
        success: r.success,
        message: r.message
      })).join('\n')
    })
    
    if (!results.every((r: TestResult) => r.success)) {
      process.exit(1)
    }
  }).catch(error => {
    logger.error('Критическая ошибка при запуске тестов:', error)
    process.exit(1)
  })
} 