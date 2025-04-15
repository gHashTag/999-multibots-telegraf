import { MyContext } from '@/interfaces'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'
import { expect } from '@/test-utils/core/testHelpers'
import { createMockWizardContext } from '@/test-utils/core/mockContext'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import mockApi from '@/test-utils/core/mock'

// Этот файл создан для исправления проблемы с импортом в runScenesTests.ts
// Фактически, нужно использовать ideasGeneratorScene.test.ts (во множественном числе)

/**
 * Запускает тесты для ideaGeneratorScene (перенаправляет к ideasGeneratorScene)
 */
export default async function runIdeaGeneratorSceneTests(): Promise<
  TestResult[]
> {
  logger.info(
    '⚠️ ideaGeneratorScene.test.ts: Перенаправление к ideasGeneratorScene.test.ts'
  )

  // Импортируем фактический файл с тестами
  const { default: runIdeasGeneratorTests } = await import(
    './ideasGeneratorScene.test'
  )

  // Запускаем тесты из правильного файла
  return runIdeasGeneratorTests()
}

/**
 * Обертка для обеспечения обратной совместимости с системой запуска тестов
 */
async function testIdeaGeneratorScene_RedirectToIdeas(): Promise<TestResult> {
  try {
    logger.info(
      '⚠️ Вызов testIdeaGeneratorScene_RedirectToIdeas перенаправлен к ideasGeneratorScene.test.ts'
    )

    // Импортируем фактический файл с тестами
    const { default: runIdeasGeneratorTests } = await import(
      './ideasGeneratorScene.test'
    )

    // Запускаем тесты из правильного файла
    const results = await runIdeasGeneratorTests()

    // Если все тесты успешны, возвращаем успешный результат
    const allSuccess = results.every(result => result.success)

    return {
      success: allSuccess,
      name: 'testIdeaGeneratorScene_RedirectToIdeas',
      category: TestCategory.All,
      message: allSuccess
        ? 'Тесты для идей генератора успешно выполнены через перенаправление'
        : 'Некоторые тесты идей генератора не прошли, см. детали',
    }
  } catch (error) {
    logger.error('Error in testIdeaGeneratorScene_RedirectToIdeas:', error)
    return {
      success: false,
      name: 'testIdeaGeneratorScene_RedirectToIdeas',
      category: TestCategory.All,
      message: `Ошибка перенаправления: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
