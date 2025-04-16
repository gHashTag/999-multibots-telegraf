import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import {
  testRussianTranslations,
  testEnglishTranslations,
  testLocalizationKeysConsistency,
} from './translationTests'

/**
 * Запускает все тесты переводов
 * @returns массив результатов тестов
 */
export function runTranslationTests(): TestResult[] {
  logger.info('Запуск тестов переводов', {
    description: 'Starting translation tests',
  })

  try {
    // Запускаем тесты для русских переводов
    logger.info('Тестирование русских переводов', {
      description: 'Testing Russian translations',
    })
    const russianResult = testRussianTranslations()

    // Запускаем тесты для английских переводов
    logger.info('Тестирование английских переводов', {
      description: 'Testing English translations',
    })
    const englishResult = testEnglishTranslations()

    // Проверяем согласованность ключей локализации
    logger.info('Проверка согласованности ключей локализации', {
      description: 'Checking localization keys consistency',
    })
    const keysConsistencyResult = testLocalizationKeysConsistency()

    // Общая проверка перевода
    logger.info('Общая проверка перевода', {
      description: 'General translation check',
    })

    // Возвращаем результаты всех тестов
    return [russianResult, englishResult, keysConsistencyResult]
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Ошибка при выполнении тестов переводов: ${errorMessage}`, {
      description: `Error running translation tests: ${errorMessage}`,
      error,
    })
    return [
      {
        name: 'Translation Tests',
        success: false,
        message: `Ошибка при выполнении тестов переводов: ${errorMessage} | Error running translation tests: ${errorMessage}`,
        category: TestCategory.Translations,
      },
    ]
  }
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  const results = runTranslationTests()

  logger.info({
    message: '📊 Результаты тестов переводов',
    description: 'Translation tests results',
    success: results.every((r: TestResult) => r.success),
    testName: 'Translation Tests Suite',
    details: results
      .map((r: TestResult) => ({
        testName: r.name,
        success: r.success,
        message: r.message,
      }))
      .join('\n'),
  })

  if (!results.every((r: TestResult) => r.success)) {
    process.exit(1)
  }
}
