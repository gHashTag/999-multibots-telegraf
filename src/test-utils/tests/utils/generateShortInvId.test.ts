import { TestResult } from '@/test-utils/types'
import { generateShortInvId } from '@/utils/generateShortInvId'

export async function testGenerateShortInvId(): Promise<TestResult> {
  const testName = 'Generate Short InvId Test'

  try {
    // Генерируем несколько ID для проверки
    const ids = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const id = generateShortInvId()

      // Проверяем что ID является числом
      if (typeof id !== 'number') {
        throw new Error('Generated ID is not a number')
      }

      // Проверяем что ID в правильном диапазоне (6 цифр)
      if (id < 100000 || id > 999999) {
        throw new Error('Generated ID is out of range (should be 6 digits)')
      }

      // Проверяем уникальность
      if (ids.has(id)) {
        throw new Error('Generated duplicate ID')
      }

      ids.add(id)
    }

    return {
      success: true,
      message: '✅ Successfully generated and validated 1000 unique IDs',
      name: testName,
    }
  } catch (error: Error | unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    return {
      success: false,
      message: `❌ Error in ${testName}: ${errorMessage}`,
      name: testName,
    }
  }
}
