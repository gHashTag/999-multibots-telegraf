import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { TestResult } from '@/test-utils/types'
import { TestCategory } from '@/test-utils/core/categories'
import { NeuroPhotoV2Tester } from './NeuroPhotoV2Tester'
import { NeuroPhotoTester } from './NeuroPhotoTester'
import { testNeuroPhotoApi } from './neuroPhotoApiTest'

// Превращаем колбэк-функцию exec в функцию, возвращающую Promise
const execAsync = promisify(exec)

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Запускает тест и возвращает результат
 */
async function runTest(
  testPath: string,
  name: string
): Promise<{
  success: boolean
  output: string
  error?: string
}> {
  try {
    logger.info({
      message: `🚀 Запуск теста ${name}`,
      description: `Running ${name} test`,
      testPath,
    })

    const { stdout, stderr } = await execAsync(
      `npx ts-node -r tsconfig-paths/register ${testPath}`
    )

    if (stderr) {
      logger.warn({
        message: `⚠️ Тест ${name} завершился с предупреждениями`,
        description: `${name} test completed with warnings`,
        warnings: stderr,
      })
    }

    logger.info({
      message: `✅ Тест ${name} завершен успешно`,
      description: `${name} test completed successfully`,
    })

    return {
      success: true,
      output: stdout,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при запуске теста ${name}`,
      description: `Error running ${name} test`,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Безопасно извлекаем stdout из ошибки
    let stdout = ''
    try {
      // @ts-ignore - Обойдем проверку типов здесь
      if (error && typeof error === 'object' && error.stdout) {
        // @ts-ignore
        stdout = error.stdout
      }
    } catch (e) {
      // Игнорируем любые ошибки при извлечении stdout
    }

    return {
      success: false,
      output: stdout,
      error: errorMessage,
    }
  }
}

/**
 * Запускает все тесты нейрофото
 */
async function runAllTests() {
  const testResults: {
    [key: string]: { success: boolean; output: string; error?: string }
  } = {}

  // Запускаем тест нейрофото
  testResults['neuroPhoto'] = await runTest(
    'test-utils/neuroPhotoTest.ts',
    'НейроФото'
  )

  // Запускаем тест нейрофото V2
  testResults['neuroPhotoV2'] = await runTest(
    'test-utils/neuroPhotoV2Test.ts',
    'НейроФото V2'
  )

  // Подводим итоги
  const allSuccess = Object.values(testResults).every(result => result.success)

  logger.info({
    message: '📊 Результаты всех тестов',
    description: 'Results of all tests',
    allSuccess,
    individualResults: Object.keys(testResults).map(testName => ({
      test: testName,
      success: testResults[testName].success,
      hasError: !!testResults[testName].error,
    })),
  })

  // Выводим подробный отчет
  console.log('\n======== РЕЗУЛЬТАТЫ ТЕСТОВ ========\n')

  for (const [testName, result] of Object.entries(testResults)) {
    console.log(`Тест: ${testName}`)
    console.log(`Статус: ${result.success ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`)

    if (result.error) {
      console.log(`Ошибка: ${result.error}`)
    }

    console.log('\n-----------------------------------\n')
  }

  console.log(
    `Общий результат: ${allSuccess ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ ЕСТЬ ОШИБКИ'}\n`
  )

  // Завершаем процесс с соответствующим кодом
  process.exit(allSuccess ? 0 : 1)
}

// Запускаем все тесты
runAllTests()

/**
 * Запускает тесты нейрофото в указанной категории
 */
export async function runNeuroPhotoTests(
  options: {
    version?: 'v1' | 'v2' | 'both'
    systemCheck?: boolean
    apiCheck?: boolean
  } = {}
): Promise<TestResult[]> {
  const { version = 'both', systemCheck = true, apiCheck = true } = options

  logger.info({
    message: '🚀 Запуск тестов нейрофото',
    description: 'Starting neurophoto tests',
    version,
    systemCheck,
    apiCheck,
  })

  const results: TestResult[] = []

  // Проверка API нейрофото
  if (apiCheck) {
    try {
      logger.info({
        message: '🧪 Запуск проверки API нейрофото',
        description: 'Starting NeuroPhoto API test',
      })

      const apiResult = await testNeuroPhotoApi()
      results.push(apiResult)

      if (!apiResult.success) {
        logger.error({
          message: '❌ Проверка API нейрофото не пройдена',
          description: 'NeuroPhoto API check failed',
        })
      } else {
        logger.info({
          message: '✅ Проверка API нейрофото успешно пройдена',
          description: 'NeuroPhoto API check succeeded',
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: '❌ Ошибка при выполнении проверки API нейрофото',
        description: 'Error running NeuroPhoto API check',
        error: errorMessage,
      })

      results.push({
        success: false,
        name: 'НейроФото API проверка',
        message: `Ошибка при выполнении проверки API: ${errorMessage}`,
        category: TestCategory.Api,
        error: errorMessage,
      })
    }
  }

  // Проверка системы НейроФото V2, если требуется
  if ((version === 'v2' || version === 'both') && systemCheck) {
    try {
      const tester = new NeuroPhotoV2Tester()
      const checkResult = await tester.runSystemCheck()

      results.push({
        success: checkResult.success,
        name: 'НейроФото V2 системная проверка',
        message: checkResult.message,
        category: TestCategory.Neuro,
        details: checkResult,
      })

      if (!checkResult.success) {
        logger.error({
          message: '❌ Системная проверка НейроФото V2 не пройдена',
          description: 'NeuroPhoto V2 system check failed',
          errorDetails: checkResult,
        })
      } else {
        logger.info({
          message: '✅ Системная проверка НейроФото V2 успешно пройдена',
          description: 'NeuroPhoto V2 system check succeeded',
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: '❌ Ошибка при выполнении системной проверки НейроФото V2',
        description: 'Error running NeuroPhoto V2 system check',
        error: errorMessage,
      })

      results.push({
        success: false,
        name: 'НейроФото V2 системная проверка',
        message: `Ошибка при выполнении системной проверки: ${errorMessage}`,
        category: TestCategory.Neuro,
        error: errorMessage,
      })
    }
  }

  // Тесты функциональности НейроФото V1
  if (version === 'v1' || version === 'both') {
    try {
      const tester = new NeuroPhotoTester()
      const testResult = await tester.runTest({
        prompt: 'Тестовый промпт для нейрофото - портрет в городе',
        model_url: 'stability-ai/sdxl',
        numImages: 1,
        telegram_id: '144022504',
        username: 'test_user',
        is_ru: true,
        bot_name: 'test_bot',
      })

      results.push({
        success: testResult.success,
        name: 'НейроФото V1 функциональный тест',
        message: 'Тест НейроФото V1 выполнен успешно',
        category: TestCategory.Neuro,
        details: testResult,
      })

      if (!testResult.success) {
        logger.error({
          message: '❌ Тест НейроФото V1 не пройден',
          description: 'NeuroPhoto V1 test failed',
        })
      } else {
        logger.info({
          message: '✅ Тест НейроФото V1 успешно пройден',
          description: 'NeuroPhoto V1 test succeeded',
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: '❌ Ошибка при выполнении теста НейроФото V1',
        description: 'Error running NeuroPhoto V1 test',
        error: errorMessage,
      })

      results.push({
        success: false,
        name: 'НейроФото V1 тест',
        message: `Ошибка при выполнении теста: ${errorMessage}`,
        category: TestCategory.Neuro,
        error: errorMessage,
      })
    }
  }

  // Тесты функциональности НейроФото V2
  if (version === 'v2' || version === 'both') {
    try {
      const tester = new NeuroPhotoV2Tester()
      const testResult = await tester.testWithPrompt(
        'Тестовый промпт для нейрофото V2 - портрет в городе'
      )

      results.push({
        success: testResult.success,
        name: 'НейроФото V2 функциональный тест',
        message: 'Тест НейроФото V2 выполнен успешно',
        category: TestCategory.Neuro,
        details: testResult,
      })

      if (!testResult.success) {
        logger.error({
          message: '❌ Тест НейроФото V2 не пройден',
          description: 'NeuroPhoto V2 test failed',
        })
      } else {
        logger.info({
          message: '✅ Тест НейроФото V2 успешно пройден',
          description: 'NeuroPhoto V2 test succeeded',
        })
      }

      // Дополнительный тест с несколькими изображениями
      const multiImageTestResult = await tester.testWithMultipleImages(2)

      results.push({
        success: multiImageTestResult.success,
        name: 'НейроФото V2 тест с несколькими изображениями',
        message:
          'Тест НейроФото V2 с несколькими изображениями выполнен успешно',
        category: TestCategory.Neuro,
        details: multiImageTestResult,
      })

      if (!multiImageTestResult.success) {
        logger.error({
          message:
            '❌ Тест НейроФото V2 с несколькими изображениями не пройден',
          description: 'NeuroPhoto V2 multi-image test failed',
        })
      } else {
        logger.info({
          message:
            '✅ Тест НейроФото V2 с несколькими изображениями успешно пройден',
          description: 'NeuroPhoto V2 multi-image test succeeded',
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error({
        message: '❌ Ошибка при выполнении теста НейроФото V2',
        description: 'Error running NeuroPhoto V2 test',
        error: errorMessage,
      })

      results.push({
        success: false,
        name: 'НейроФото V2 тест',
        message: `Ошибка при выполнении теста: ${errorMessage}`,
        category: TestCategory.Neuro,
        error: errorMessage,
      })
    }
  }

  // Общий результат
  const allSuccess = results.every(r => r.success)

  logger.info({
    message: allSuccess
      ? '✅ Все тесты нейрофото успешно пройдены'
      : '❌ Некоторые тесты нейрофото не пройдены',
    description: allSuccess
      ? 'All neurophoto tests passed'
      : 'Some neurophoto tests failed',
    results: results.map(r => ({ name: r.name, success: r.success })),
  })

  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  const version =
    (process.env.NEUROPHOTO_VERSION as 'v1' | 'v2' | 'both') || 'both'
  const systemCheck = process.env.SYSTEM_CHECK !== 'false'
  const apiCheck = process.env.API_CHECK !== 'false'

  runNeuroPhotoTests({ version, systemCheck, apiCheck })
    .then(results => {
      const allSuccess = results.every(r => r.success)

      if (!allSuccess) {
        process.exit(1)
      }

      process.exit(0)
    })
    .catch(error => {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов нейрофото',
        description: 'Critical error running neurophoto tests',
        error: error instanceof Error ? error.message : String(error),
      })

      process.exit(1)
    })
}
