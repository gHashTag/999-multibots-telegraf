import { config } from 'dotenv'
import path from 'path'
import { logger } from '../../../utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { NeuroPhotoV2Tester } from './NeuroPhotoV2Tester'
import { NeuroPhotoTester } from './NeuroPhotoTester'
import { testNeuroPhotoApi } from './neuroPhotoApiTest'
import { testNeuroPhotoDirect, runRealApiTest } from './testNeuroPhotoDirect'

// Превращаем колбэк-функцию exec в функцию, возвращающую Promise
const execAsync = promisify(exec)

// Загружаем переменные окружения
config({ path: path.resolve('.env.test') })

/**
 * Запускает тест и возвращает результат
 */
async function runTest(testPath: string, name: string): Promise<TestResult> {
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
      name,
      message: `Тест ${name} выполнен успешно`,
      category: TestCategory.Neuro,
      details: { output: stdout },
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
      name,
      message: `Ошибка при выполнении теста ${name}`,
      error: errorMessage,
      category: TestCategory.Neuro,
      details: { output: stdout },
    }
  }
}

/**
 * Запускает все тесты нейрофото
 */
async function runAllTests(): Promise<TestResult[]> {
  logger.info({
    message: '🧪 Запуск всех тестов нейрофото...',
    description: 'Running all neurophoto tests',
  })

  // Инициализируем переменную для отслеживания ошибок
  let hasFailures = false
  let totalTests = 0
  let passedTests = 0
  const results: TestResult[] = []
  const startTime = new Date().getTime()

  try {
    // Проверяем переменные окружения
    const neurophotoVersion = process.env.NEUROPHOTO_VERSION
    const systemCheck = process.env.SYSTEM_CHECK === 'true'
    const apiCheck = process.env.API_CHECK === 'true'
    const directTest = process.env.DIRECT_TEST === 'true'
    const realApiTest = process.env.REAL_API_TEST === 'true'

    logger.info({
      message: '🔧 Конфигурация тестов нейрофото',
      description: 'Neurophoto test configuration',
      neurophotoVersion,
      systemCheck,
      apiCheck,
      directTest,
      realApiTest,
    })

    // Запускаем тест нейрофото
    const neuroPhotoResult = await runTest(
      'test-utils/neuroPhotoTest.ts',
      'НейроФото'
    )
    results.push(neuroPhotoResult)
    totalTests++

    if (neuroPhotoResult.success) {
      passedTests++
      logger.info({
        message: '✅ Тест НейроФото успешно пройден',
        description: 'NeuroPhoto test passed',
      })
    } else {
      hasFailures = true
      logger.error({
        message: '❌ Тест НейроФото не пройден',
        description: 'NeuroPhoto test failed',
        error: neuroPhotoResult.error,
      })
    }

    // Запускаем тест нейрофото V2
    const neuroPhotoV2Result = await runTest(
      'test-utils/neuroPhotoV2Test.ts',
      'НейроФото V2'
    )
    results.push(neuroPhotoV2Result)
    totalTests++

    if (neuroPhotoV2Result.success) {
      passedTests++
      logger.info({
        message: '✅ Тест НейроФото V2 успешно пройден',
        description: 'NeuroPhoto V2 test passed',
      })
    } else {
      hasFailures = true
      logger.error({
        message: '❌ Тест НейроФото V2 не пройден',
        description: 'NeuroPhoto V2 test failed',
        error: neuroPhotoV2Result.error,
      })
    }

    // Проверка API нейрофото
    if (apiCheck) {
      try {
        logger.info({
          message: '🧪 Запуск проверки API нейрофото',
          description: 'Starting NeuroPhoto API test',
        })

        const apiResult = await testNeuroPhotoApi()
        results.push(apiResult)
        totalTests++

        if (!apiResult.success) {
          hasFailures = true
          logger.error({
            message: '❌ Проверка API нейрофото не пройдена',
            description: 'NeuroPhoto API check failed',
          })
        } else {
          logger.info({
            message: '✅ Проверка API нейрофото успешно пройдена',
            description: 'NeuroPhoto API check succeeded',
          })
          passedTests++
        }
      } catch (error) {
        hasFailures = true
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
    if (
      (neurophotoVersion === 'v2' || neurophotoVersion === 'both') &&
      systemCheck
    ) {
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
          hasFailures = true
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
          passedTests++
        }
      } catch (error) {
        hasFailures = true
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
    if (neurophotoVersion === 'v1' || neurophotoVersion === 'both') {
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
          hasFailures = true
          logger.error({
            message: '❌ Тест НейроФото V1 не пройден',
            description: 'NeuroPhoto V1 test failed',
          })
        } else {
          logger.info({
            message: '✅ Тест НейроФото V1 успешно пройден',
            description: 'NeuroPhoto V1 test succeeded',
          })
          passedTests++
        }
      } catch (error) {
        hasFailures = true
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
    if (neurophotoVersion === 'v2' || neurophotoVersion === 'both') {
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
          hasFailures = true
          logger.error({
            message: '❌ Тест НейроФото V2 не пройден',
            description: 'NeuroPhoto V2 test failed',
          })
        } else {
          logger.info({
            message: '✅ Тест НейроФото V2 успешно пройден',
            description: 'NeuroPhoto V2 test succeeded',
          })
          passedTests++
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
          hasFailures = true
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
          passedTests++
        }
      } catch (error) {
        hasFailures = true
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

    // Проверяем опцию direct test
    if (directTest) {
      console.log('🚀 Запуск теста прямой генерации нейрофото...')

      try {
        const directResult = await testNeuroPhotoDirect(
          process.env.ADMIN_TELEGRAM_ID
        )
        results.push({
          name: 'Прямая генерация нейрофото',
          success: directResult,
          message: directResult
            ? 'Тест прямой генерации нейрофото успешно пройден'
            : 'Тест прямой генерации нейрофото не пройден',
          category: TestCategory.Neuro,
        })

        if (directResult) {
          console.log('✅ Тест прямой генерации нейрофото успешно пройден')
        } else {
          console.log('❌ Тест прямой генерации нейрофото не пройден')
          hasFailures = true
        }
      } catch (error) {
        hasFailures = true
        console.error(
          '❌ Критическая ошибка при тесте прямой генерации:',
          error
        )
        results.push({
          name: 'Прямая генерация нейрофото',
          success: false,
          message: 'Критическая ошибка при тесте прямой генерации',
          error: error instanceof Error ? error.message : String(error),
          category: TestCategory.Neuro,
        })
      }
    }

    // Проверяем опцию real API test
    if (realApiTest) {
      console.log('🚀 Запуск теста с реальным API...')

      try {
        const realApiResult = await runRealApiTest({
          telegram_id: process.env.ADMIN_TELEGRAM_ID || '',
          prompt: process.env.TEST_PROMPT,
          numImages: process.env.TEST_NUM_IMAGES
            ? parseInt(process.env.TEST_NUM_IMAGES, 10)
            : undefined,
          is_ru: process.env.TEST_IS_RU || 'true',
        })

        results.push({
          name: 'Тест с реальным API',
          success: realApiResult,
          message: realApiResult
            ? 'Тест с реальным API успешно пройден'
            : 'Тест с реальным API не пройден',
          category: TestCategory.Neuro,
        })

        if (realApiResult) {
          console.log('✅ Тест с реальным API успешно пройден')
        } else {
          console.log('❌ Тест с реальным API не пройден')
          hasFailures = true
        }
      } catch (error) {
        hasFailures = true
        console.error('❌ Критическая ошибка при тесте с реальным API:', error)
        results.push({
          name: 'Тест с реальным API',
          success: false,
          message: 'Критическая ошибка при тесте с реальным API',
          error: error instanceof Error ? error.message : String(error),
          category: TestCategory.Neuro,
        })
      }
    }

    // Общий результат
    const allSuccess = results.every(r => r.success)
    const endTime = new Date().getTime()
    const duration = endTime - startTime

    logger.info({
      message: allSuccess
        ? '✅ Все тесты нейрофото успешно пройдены'
        : '❌ Некоторые тесты нейрофото не пройдены',
      description: allSuccess
        ? 'All neurophoto tests passed'
        : 'Some neurophoto tests failed',
      results: results.map(r => ({ name: r.name, success: r.success })),
      totalTests,
      passedTests,
      duration: `${Math.round(duration / 1000)} секунд`,
    })

    // Добавляем метатест с общим результатом
    results.push({
      name: 'Итоговый результат тестов нейрофото',
      success: !hasFailures, // Используем переменную hasFailures для определения общего успеха
      message: hasFailures
        ? 'Некоторые тесты нейрофото не пройдены'
        : 'Все тесты нейрофото успешно пройдены',
      category: TestCategory.Neuro,
      details: {
        totalTests,
        passedTests,
        duration: `${Math.round(duration / 1000)} секунд`,
      },
    })

    return results
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: '❌ Критическая ошибка при выполнении тестов нейрофото',
      description: 'Critical error running neurophoto tests',
      error: errorMessage,
    })

    return [
      {
        name: 'Критическая ошибка тестов нейрофото',
        success: false,
        message: `Критическая ошибка при выполнении тестов: ${errorMessage}`,
        error: errorMessage,
        category: TestCategory.Neuro,
      },
    ]
  }
}

// Экспортируем функцию по умолчанию для использования в других модулях
export default runAllTests

// Если файл запускается напрямую
if (require.main === module) {
  ;(async () => {
    try {
      // Проверяем переменные окружения
      const neurophotoVersion = process.env.NEUROPHOTO_VERSION
      const systemCheck = process.env.SYSTEM_CHECK === 'true'
      const apiCheck = process.env.API_CHECK === 'true'
      const directTest = process.env.DIRECT_TEST === 'true'
      const realApiTest = process.env.REAL_API_TEST === 'true'

      logger.info({
        message: '🧪 Запуск тестов нейрофото напрямую',
        description: 'Running neurophoto tests directly',
        neurophotoVersion,
        systemCheck,
        apiCheck,
        directTest,
        realApiTest,
      })

      // Запускаем тесты в зависимости от указанных переменных окружения
      if (neurophotoVersion === 'v1') {
        await runTest('./neuroPhotoTest.ts', 'Тест генерации нейрофото V1')
      } else if (neurophotoVersion === 'v2') {
        await runTest('./neuroPhotoV2Test.ts', 'Тест генерации нейрофото V2')
      } else if (apiCheck) {
        await runTest('./neuroPhotoApiTest.ts', 'Тест API генерации нейрофото')
      } else if (directTest) {
        await runTest(
          './testNeuroPhotoDirect.ts',
          'Тест прямой генерации нейрофото'
        )
      } else if (realApiTest) {
        await runTest(
          './testNeuroPhotoRealAPI.ts',
          'Тест генерации нейрофото с реальным API'
        )
      } else {
        // По умолчанию запускаем все тесты
        const results = await runAllTests()

        const allSuccess = results.every(r => r.success)

        if (allSuccess) {
          logger.info({
            message: '✅ Все тесты нейрофото успешно пройдены',
            description: 'All neurophoto tests passed successfully',
          })
          process.exit(0)
        } else {
          logger.error({
            message: '❌ Некоторые тесты нейрофото не пройдены',
            description: 'Some neurophoto tests failed',
            failedTests: results.filter(r => !r.success).map(r => r.name),
          })
          process.exit(1)
        }
      }
    } catch (error) {
      logger.error({
        message: '❌ Критическая ошибка при запуске тестов нейрофото',
        description: 'Critical error running neurophoto tests',
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  })()
}
