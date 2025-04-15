import { isRussian } from '@/helpers/language'
import { Context } from 'telegraf'
import assert from '@/test-utils/core/assert'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'

// --- Хелпер для создания мок-контекста ---

const createMockCtx = (
  languageCode?: string,
  fromValue?:
    | {
        id: number
        is_bot: boolean
        first_name: string
        language_code?: string
      }
    | undefined
): Context => {
  return {
    from: fromValue,
    // Добавляем другие минимально необходимые поля Context, если нужны
    chat: { id: 123, type: 'private' },
    update: {}, // Добавим пустой объект update
  } as Context
}

// --- Тестовые функции ---

export async function testIsRussian_Ru(): Promise<TestResult> {
  const testName = 'isRussian: language code ru'
  try {
    const ctx = createMockCtx('ru', {
      id: 123,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    })
    const result = isRussian(ctx)
    assert.isTrue(result, `${testName} should return true`)
    return { name: testName, success: true, message: 'Passed' }
  } catch (error: any) {
    return { name: testName, success: false, message: error.message, error }
  }
}
testIsRussian_Ru.meta = { category: TestCategory.Api } // Используем категорию Api

export async function testIsRussian_En(): Promise<TestResult> {
  const testName = 'isRussian: language code en'
  try {
    const ctx = createMockCtx('en', {
      id: 123,
      is_bot: false,
      first_name: 'Test',
      language_code: 'en',
    })
    const result = isRussian(ctx)
    assert.isFalse(result, `${testName} should return false`)
    return { name: testName, success: true, message: 'Passed' }
  } catch (error: any) {
    return { name: testName, success: false, message: error.message, error }
  }
}
testIsRussian_En.meta = { category: TestCategory.Api }

export async function testIsRussian_UndefinedLang(): Promise<TestResult> {
  const testName = 'isRussian: language code undefined'
  try {
    const ctx = createMockCtx(undefined, {
      id: 123,
      is_bot: false,
      first_name: 'Test',
      language_code: undefined,
    })
    const result = isRussian(ctx)
    assert.isFalse(result, `${testName} should return false`)
    return { name: testName, success: true, message: 'Passed' }
  } catch (error: any) {
    return { name: testName, success: false, message: error.message, error }
  }
}
testIsRussian_UndefinedLang.meta = { category: TestCategory.Api }

export async function testIsRussian_NoFrom(): Promise<TestResult> {
  const testName = 'isRussian: no from field'
  try {
    const ctx = createMockCtx(undefined, undefined) // Передаем undefined для from
    const result = isRussian(ctx)
    assert.isFalse(result, `${testName} should return false`)
    return { name: testName, success: true, message: 'Passed' }
  } catch (error: any) {
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error.message}`,
      error,
    }
  }
}
testIsRussian_NoFrom.meta = { category: TestCategory.Api }

// --- Функция запуска ---

export async function runLanguageHelperTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  const tests = [
    testIsRussian_Ru,
    testIsRussian_En,
    testIsRussian_UndefinedLang,
    testIsRussian_NoFrom,
  ]
  const results: TestResult[] = []
  for (const test of tests) {
    const result = await test()
    // Добавляем категорию к результату
    results.push({ ...result, category: TestCategory.Api }) // Используем Api
  }
  return results
}
