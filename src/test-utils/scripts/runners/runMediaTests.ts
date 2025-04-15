import { TestRunnerConfig } from '../index'
import * as mediaTests from '../../tests/media'

/**
 * Запускает все тесты медиа-функционала с заданной конфигурацией
 * @param config Конфигурация для запуска тестов
 */
export const runMediaTests = async (
  config: TestRunnerConfig = {}
): Promise<void> => {
  const { verbose = false, filter, timeout = 30000, parallel = true } = config

  console.log('🎥 Starting media tests...')

  // Получаем все тестовые функции
  const testFunctions = Object.values(mediaTests)

  if (filter) {
    const filteredTests = testFunctions.filter(test =>
      test.name.toLowerCase().includes(filter.toLowerCase())
    )
    console.log(`Running ${filteredTests.length} filtered media tests...`)
    await runTests(filteredTests, { timeout, parallel })
  } else {
    console.log(`Running all ${testFunctions.length} media tests...`)
    await runTests(testFunctions, { timeout, parallel })
  }

  console.log('✅ All media tests completed!')
}

/**
 * Запускает набор тестовых функций
 */
async function runTests(
  tests: Array<() => Promise<void>>,
  options: { timeout: number; parallel: boolean }
): Promise<void> {
  const { timeout, parallel } = options

  if (parallel) {
    await Promise.all(
      tests.map(test =>
        Promise.race([
          test(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Test ${test.name} timed out`)),
              timeout
            )
          ),
        ])
      )
    )
  } else {
    for (const test of tests) {
      await Promise.race([
        test(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Test ${test.name} timed out`)),
            timeout
          )
        ),
      ])
    }
  }
}
