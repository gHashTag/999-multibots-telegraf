import { TestFunction, TestResult } from './types'

/**
 * Функция для запуска набора тестов
 * @param tests Массив тестовых функций для запуска
 * @returns Массив результатов тестов
 */
export async function runTests(tests: TestFunction[]): Promise<TestResult[]> {
  console.log(`🚀 [TEST_RUNNER]: Запуск ${tests.length} тестов...`)

  const results: TestResult[] = []

  for (const testFn of tests) {
    try {
      const result = await testFn()
      results.push(result)

      if (result.success) {
        console.log(`✅ [TEST_RUNNER]: Тест "${result.name}" успешно пройден`)
      } else {
        console.error(
          `❌ [TEST_RUNNER]: Тест "${result.name}" не пройден: ${result.message}`
        )
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const result: TestResult = {
        success: false,
        name: testFn.name || 'Неизвестный тест',
        message: `Необработанная ошибка: ${errorMessage}`,
        details: error,
      }

      results.push(result)
      console.error(
        `❌ [TEST_RUNNER]: Ошибка при выполнении теста "${result.name}": ${errorMessage}`,
        error
      )
    }
  }

  // Вывод статистики
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = totalTests - passedTests

  console.log(`\n🏁 [TEST_RUNNER]: Выполнение тестов завершено`)
  console.log(
    `📊 [TEST_RUNNER]: Статистика: всего=${totalTests}, успешно=${passedTests}, неудачно=${failedTests}`
  )

  if (failedTests > 0) {
    console.log(`\n📝 [TEST_RUNNER]: Неудачные тесты:`)
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  ⛔ ${r.name}: ${r.message}`)
      })
  }

  return results
}
