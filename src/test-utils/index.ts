import { TestResult } from './interfaces'
import { Logger as logger } from '@/utils/logger'
import { testNeuroPhotoGeneration } from './tests/neuroPhoto.test'

// Остальные импорты тестов
// ... existing code ...

/**
 * Функция для запуска всех тестов
 */
export async function runTests(
  selectedTests?: Array<() => Promise<TestResult>>
): Promise<void> {
  const allTests = [
    testNeuroPhotoGeneration,
    // ... existing code ...
  ]

  const testsToRun = selectedTests || allTests

  logger.info('🚀 Запуск тестов', {
    description: 'Starting test runner',
    total_tests: testsToRun.length,
  })

  // ... existing code ...
}
