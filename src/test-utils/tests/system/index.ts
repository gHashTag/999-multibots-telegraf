/**
 * Индекс системных тестов
 */
import { logger } from '@/utils/logger'
import { TestResult } from '../../types'
import { runAgentRouterTests } from './agentRouterTest'
import { runMockFunctionTest } from '../mockFnTest'

/**
 * Запускает все системные тесты
 */
export async function runSystemTests(): Promise<TestResult[]> {
  logger.info('🚀 [TEST_RUNNER]: Запуск системных тестов')

  // Запускаем тесты агентского роутера
  const agentRouterResults = await runAgentRouterTests()

  // Запускаем тесты мок-функций
  const mockFunctionResults = await runMockFunctionTest()
  // Преобразуем в массив, так как функция возвращает один результат
  const mockFunctionResultsArray = [mockFunctionResults]

  // Здесь можно добавить другие системные тесты
  // const otherSystemResults = await runOtherSystemTests()

  // Объединяем результаты всех тестов
  const results = [
    ...agentRouterResults,
    ...mockFunctionResultsArray,
    // ...otherSystemResults,
  ]

  // Выводим статистику
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = totalTests - passedTests

  logger.info(
    `📊 [TEST_RUNNER]: Статистика системных тестов: всего=${totalTests}, успешно=${passedTests}, неудачно=${failedTests}`
  )

  return results
}

// Экспортируем функции тестов
export { runAgentRouterTests, runMockFunctionTest }
