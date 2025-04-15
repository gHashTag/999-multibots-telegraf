import { checkFullAccess } from '@/handlers/checkFullAccess'
import assert from '@/test-utils/core/assert'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'

const fullAccessSubscriptions = [
  'neurophoto',
  'neurobase',
  'neuromeeting',
  'neuroblogger',
  'neurotester',
]

const noAccessSubscriptions = [
  'stars',
  'free',
  'some_other_plan',
  '', // Пустая строка
]

// Тесты для подписок с полным доступом
const fullAccessTests = fullAccessSubscriptions.map(
  sub => async (): Promise<TestResult> => {
    const testName = `checkFullAccess: ${sub} should grant access`
    try {
      const result = checkFullAccess(sub)
      assert.isTrue(result, `${testName} - result should be true`)
      return { name: testName, success: true, message: 'Passed' }
    } catch (error: any) {
      return { name: testName, success: false, message: error.message, error }
    }
  }
)

// Тесты для подписок без полного доступа
const noAccessTests = noAccessSubscriptions.map(
  sub => async (): Promise<TestResult> => {
    const testName = `checkFullAccess: ${sub || 'empty string'} should deny access`
    try {
      const result = checkFullAccess(sub)
      assert.isFalse(result, `${testName} - result should be false`)
      return { name: testName, success: true, message: 'Passed' }
    } catch (error: any) {
      return { name: testName, success: false, message: error.message, error }
    }
  }
)

// Функция для запуска всех тестов этого модуля
export async function runCheckFullAccessTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  const tests = [...fullAccessTests, ...noAccessTests]
  const results: TestResult[] = []
  for (const test of tests) {
    const result = await test()
    // Исправляем категорию на Api
    results.push({ ...result, category: TestCategory.Api })
  }
  return results
}
