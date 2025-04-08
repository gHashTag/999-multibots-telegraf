#!/usr/bin/env node
/**
 * Основной файл для запуска тестов
 * Использование:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип теста]
 *
 * Примеры:
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts database
 *   ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all
 */

import {
  ReplicateWebhookTester,
  BFLWebhookTester,
  NeurophotoWebhookTester,
} from './webhook-tests'
import { DatabaseTester } from './database-tests'
import { InngestTester } from './inngest-tests'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'

import { TestResult } from './types'

import { getBotByName } from '@/core/bot'

// Цвета для вывода в консоль
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

/**
 * Форматирует результаты тестов для вывода в консоль
 */
function formatResults(results: TestResult[], testType: string) {
  console.log(
    `\n${colors.bright}${colors.blue}=== Результаты тестов ${testType} ===${colors.reset}\n`
  )

  const successful = results.filter(r => r.success).length
  const total = results.length

  console.log(
    `${colors.bright}Выполнено: ${total} | Успешно: ${
      successful === total ? colors.green : colors.yellow
    }${successful}${colors.reset}/${total} | Ошибок: ${
      total - successful > 0 ? colors.red : colors.green
    }${total - successful}${colors.reset}\n`
  )

  results.forEach((result, index) => {
    const statusColor = result.success ? colors.green : colors.red
    const status = result.success ? '✅ УСПЕХ' : '❌ ОШИБКА'
    const duration = result.duration ? `(${result.duration}мс)` : ''

    console.log(
      `${index + 1}. ${statusColor}${status}${colors.reset} ${colors.bright}${
        result.name
      }${colors.reset} ${colors.yellow}${duration}${colors.reset}`
    )
    console.log(`   ${result.message}`)

    if (!result.success && result.error) {
      console.log(`   ${colors.red}Ошибка: ${result.error}${colors.reset}`)
    }

    console.log('')
  })

  return { successful, total }
}

/**
 * Выводит справку по использованию скрипта
 */
function printHelp() {
  console.log(`
${colors.bright}${colors.blue}СКРИПТ ЗАПУСКА ТЕСТОВ${colors.reset}

Используйте: ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts [тип-тестов] [параметры]${colors.reset}

${colors.bright}Доступные типы тестов:${colors.reset}
  ${colors.cyan}webhook${colors.reset}    - Тесты вебхуков Replicate
  ${colors.cyan}bfl-webhook${colors.reset} - Тесты вебхуков BFL
  ${colors.cyan}neurophoto-webhook${colors.reset} - Тесты вебхуков нейрофото
  ${colors.cyan}database${colors.reset}   - Тесты базы данных
  ${colors.cyan}inngest${colors.reset}    - Тесты Inngest функций
  ${colors.cyan}neuro${colors.reset}      - Тесты генерации изображений
  ${colors.cyan}neurophoto-v2${colors.reset} - Тесты генерации нейрофото V2
  ${colors.cyan}function${colors.reset}   - Тесты конкретных Inngest функций (требуется указать имя функции)
  ${colors.cyan}voice-avatar${colors.reset} - Тесты генерации голосового аватара
  ${colors.cyan}text-to-speech${colors.reset} - Тесты преобразования текста в речь
  ${colors.cyan}text-to-video${colors.reset}    - Тесты генерации видео из текста
  ${colors.cyan}all${colors.reset}        - Все тесты

${colors.bright}Параметры:${colors.reset}
  ${colors.cyan}--dry-run${colors.reset}        - Запуск без проверки базы данных (только для некоторых тестов)
  ${colors.cyan}--debug-endpoint${colors.reset}  - Использовать отладочный эндпоинт (для нейрофото)

${colors.bright}Примеры:${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts bfl-webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --dry-run${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --debug-endpoint${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-webhook --dry-run --debug-endpoint${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts database${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts inngest${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neuro${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts neurophoto-v2${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts function hello-world${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts text-to-speech${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts text-to-video${colors.reset}
  ${colors.cyan}ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts all${colors.reset}

${colors.bright}Доступные Inngest функции для тестирования:${colors.reset}
  ${colors.cyan}hello-world${colors.reset}       - Простая тестовая функция
  ${colors.cyan}broadcast${colors.reset}         - Функция массовой рассылки
  ${colors.cyan}payment${colors.reset}           - Функция обработки платежей
  ${colors.cyan}model-training${colors.reset}    - Функция тренировки моделей
  ${colors.cyan}model-training-v2${colors.reset} - Функция тренировки моделей v2
  ${colors.cyan}neuro${colors.reset}             - Функция генерации изображений
  ${colors.cyan}neurophoto-v2${colors.reset}     - Функция генерации нейрофото V2
  ${colors.cyan}voice-avatar${colors.reset}       - Функция генерации голосового аватара
  ${colors.cyan}text-to-speech${colors.reset}    - Функция преобразования текста в речь
  `)
}

/**
 * Главная функция запуска тестов
 */
async function main() {
  const args = process.argv.slice(2)
  const testType = args[0]?.toLowerCase() || 'all'

  // Переменная для отслеживания общего результата тестов
  let allSuccessful = true

  // Проверяем наличие флагов
  const dryRun = args.includes('--dry-run')
  const useDebugEndpoint = args.includes('--debug-endpoint')

  console.log(
    `\n${colors.bright}${colors.blue}🧪 ЗАПУСК ТЕСТОВ${colors.reset}\n`
  )
  console.log(`Тип тестов: ${colors.cyan}${testType}${colors.reset}`)
  if (dryRun) {
    console.log(
      `${colors.yellow}Режим: dry run (без проверки базы данных)${colors.reset}`
    )
  }
  if (useDebugEndpoint) {
    console.log(
      `${colors.yellow}Режим: использование отладочного эндпоинта${colors.reset}`
    )
  }
  console.log(
    `URL API: ${colors.cyan}${TEST_CONFIG.server.apiUrl}${colors.reset}`
  )

  if (['webhook', 'all'].includes(testType)) {
    console.log(
      `Путь вебхука Replicate: ${colors.cyan}${TEST_CONFIG.server.webhookPath}${colors.reset}\n`
    )
  }

  if (['bfl-webhook', 'all'].includes(testType)) {
    console.log(
      `Путь вебхука BFL: ${colors.cyan}${TEST_CONFIG.server.bflWebhookPath}${colors.reset}\n`
    )
  }

  if (['neurophoto-webhook', 'all'].includes(testType)) {
    console.log(
      `Путь вебхука нейрофото: ${colors.cyan}${TEST_CONFIG.server.neurophotoWebhookPath}${colors.reset}\n`
    )
  }

  if (['inngest', 'neuro', 'all'].includes(testType)) {
    const inngestUrl = process.env.INNGEST_DEV_URL || 'http://localhost:8288'
    console.log(
      `URL Inngest Dev Server: ${colors.cyan}${inngestUrl}${colors.reset}`
    )
  }

  console.log('')

  try {
    // Проверяем, какие тесты запускать
    if (testType === 'webhook' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов вебхуков Replicate',
        description: 'Starting Replicate webhook tests',
      })

      const webhookTester = new ReplicateWebhookTester()
      const webhookResults = await webhookTester.runAllTests()
      const { successful, total } = formatResults(
        webhookResults,
        'вебхуков Replicate'
      )
      if (successful < total) {
        allSuccessful = false
      }
    }

    if (testType === 'bfl-webhook' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов вебхуков BFL',
        description: 'Starting BFL webhook tests',
      })

      const bflWebhookTester = new BFLWebhookTester()
      const bflWebhookResults = await bflWebhookTester.runAllTests()
      formatResults(bflWebhookResults, 'вебхуков BFL')
    }

    if (testType === 'neurophoto-webhook' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов вебхуков нейрофото',
        description: 'Starting neurophoto webhook tests',
        dryRun,
        useDebugEndpoint,
      })

      const neurophotoWebhookTester = new NeurophotoWebhookTester()
      const neurophotoWebhookResults =
        await neurophotoWebhookTester.runAllTests({
          checkDatabase: !dryRun,
          useDebugEndpoint,
        })
      const { successful, total } = formatResults(
        neurophotoWebhookResults,
        'вебхуков нейрофото'
      )
      allSuccessful = allSuccessful && successful === total
    }

    if (testType === 'database' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов базы данных',
        description: 'Starting database tests',
      })

      const dbTester = new DatabaseTester()
      const dbResults = await dbTester.runAllTests()
      formatResults(dbResults as TestResult[], 'базы данных')
    }

    if (testType === 'inngest' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов Inngest функций',
        description: 'Starting Inngest function tests',
      })

      const inngestTester = new InngestTester()
      const inngestResults = await inngestTester.runAllTests()
      formatResults(inngestResults, 'Inngest функций')
    }

    if (testType === 'neuro') {
      logger.info({
        message: '🧪 Запуск тестов генерации изображений',
        description: 'Starting image generation tests',
      })

      const inngestTester = new InngestTester()
      const neuroResults = await inngestTester.runImageGenerationTests()

      // Также запускаем тесты NeuroPhoto V2 при запуске тестов neuro
      logger.info({
        message: '🧪 Запуск тестов генерации нейрофото V2',
        description: 'Starting NeuroPhoto V2 generation tests',
      })

      // Добавляем результаты тестов NeuroPhoto V2 к результатам обычных тестов
      const neuroPhotoV2Results = await inngestTester.runSpecificFunctionTests(
        'neurophoto-v2'
      )
      const allNeuroResults = [...neuroResults, ...neuroPhotoV2Results]

      formatResults(allNeuroResults, 'генерации изображений')
    }

    if (testType === 'neurophoto-v2') {
      logger.info({
        message: '🧪 Запуск тестов генерации нейрофото V2',
        description: 'Starting NeuroPhoto V2 generation tests',
      })

      const inngestTester = new InngestTester()
      const neuroPhotoV2Results = await inngestTester.runSpecificFunctionTests(
        'neurophoto-v2'
      )
      formatResults(neuroPhotoV2Results, 'генерации нейрофото V2')
    }

    if (testType === 'function') {
      logger.info({
        message: '🧪 Запуск тестов конкретных Inngest функций',
        description: 'Starting specific Inngest function tests',
      })

      const functionName = args[1]
      if (!functionName) {
        console.log(
          `${colors.red}Необходимо указать имя функции для тестирования!${colors.reset}\n`
        )
        console.log(
          `${colors.cyan}Доступные функции: hello-world, broadcast, payment, model-training, model-training-v2, neuro, neurophoto-v2, voice-avatar${colors.reset}\n`
        )
        console.log(
          `${colors.cyan}Пример: ts-node -r tsconfig-paths/register src/test-utils/test-runner.ts function hello-world${colors.reset}\n`
        )
        printHelp()
        process.exit(1)
      }

      const inngestTester = new InngestTester()
      const functionResults = await inngestTester.runSpecificFunctionTests(
        functionName
      )
      formatResults(functionResults, `Inngest функции "${functionName}"`)
    }

    if (testType === 'voice-avatar') {
      logger.info({
        message: '🧪 Запуск тестов генерации голосового аватара',
        description: 'Starting voice avatar tests',
      })

      const inngestTester = new InngestTester()
      const voiceAvatarResults = await inngestTester.runVoiceAvatarTests()
      formatResults(voiceAvatarResults, 'генерации голосового аватара')
    }

    if (testType === 'text-to-speech') {
      logger.info({
        message: '🧪 Запуск тестов преобразования текста в речь',
        description: 'Starting text-to-speech tests',
      })

      const inngestTester = new InngestTester()
      const textToSpeechResults = await inngestTester.runTextToSpeechTests()
      const { successful, total } = formatResults(
        textToSpeechResults,
        'Текст-в-речь'
      )

      if (successful < total) {
        allSuccessful = false
      }
    }

    if (testType === 'text-to-video' || testType === 'all') {
      logger.info({
        message: '🧪 Запуск тестов генерации видео из текста',
        description: 'Starting text-to-video tests',
      })

      const inngestTester = new InngestTester()
      const textToVideoResults = await inngestTester.runTextToVideoTests()
      const { successful, total } = formatResults(textToVideoResults, 'Текст-в-видео')

      if (successful < total) {
        allSuccessful = false
      }
    }

    if (testType === 'help' || testType === '--help' || testType === '-h') {
      printHelp()
    }

    if (
      ![
        'webhook',
        'bfl-webhook',
        'neurophoto-webhook',
        'database',
        'inngest',
        'neuro',
        'neurophoto-v2',
        'function',
        'voice-avatar',
        'text-to-speech',
        'text-to-video',
        'all',
        'help',
        '--help',
        '-h',
      ].includes(testType)
    ) {
      console.log(
        `${colors.red}Неизвестный тип тестов: ${testType}${colors.reset}\n`
      )
      printHelp()
    }

    // Добавляем текст-в-речь тесты в общие тесты
    if (testType === 'all') {
      // Тесты текст-в-речь
      logger.info({
        message: '🧪 Запуск тестов преобразования текста в речь',
        description: 'Starting text-to-speech tests',
      })

      const inngestTester = new InngestTester()
      const textToSpeechResults = await inngestTester.runTextToSpeechTests()
      const textToSpeechStats = formatResults(
        textToSpeechResults,
        'Текст-в-речь'
      )

      if (textToSpeechStats.successful < textToSpeechStats.total) {
        allSuccessful = false
      }
    }

    // Запуск тестов
    const speechResults = await runSpeechGenerationTest()

    if (speechResults.success) {
      logger.info({
        message: '🎉 Все тесты пройдены успешно',
        description: 'All tests passed successfully',
        duration: speechResults.duration,
        name: speechResults.name,
        details: speechResults.message,
      })
    } else {
      logger.error({
        message: '❌ Тесты завершились с ошибками',
        description: 'Tests failed',
        error: speechResults.error,
        duration: speechResults.duration,
        name: speechResults.name,
        details: speechResults.message,
      })
      allSuccessful = false
      process.exit(1)
    }

    if (!allSuccessful) {
      process.exit(1)
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при запуске тестов',
      description: 'Error running tests',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    console.log(
      `\n${colors.red}${colors.bright}ОШИБКА: ${
        error instanceof Error ? error.message : 'Unknown error'
      }${colors.reset}\n`
    )
    process.exit(1)
  }
}

// Запускаем основную функцию, если файл запущен напрямую
if (require.main === module) {
  main().catch(error => {
    console.error(`Critical error: ${error.message}`)
    process.exit(1)
  })
}

async function runSpeechGenerationTest(): Promise<TestResult> {
  logger.info({
    message: '🎯 Запуск теста генерации речи',
    description: 'Starting speech generation test',
  })

  const testCases = [
    {
      name: 'Короткий текст через generateSpeech',
      text: 'Привет, это тестовое сообщение!',
    },
    {
      name: 'Длинный текст через generateSpeech',
      text: 'Это длинный тестовый текст для проверки работы функции преобразования текста в речь. Он содержит несколько предложений.',
    },
  ]

  try {
    const results: TestResult[] = []

    for (const testCase of testCases) {
      logger.info({
        message: `🧪 Тест кейс: ${testCase.name}`,
        description: `Testing case: ${testCase.name}`,
        text_length: testCase.text.length,
      })

      // Получаем бота
      const botName = 'neuro_blogger_bot' // Используем существующего бота
      const botData = await getBotByName(botName)

      if (!botData?.bot) {
        throw new Error('Bot instance not found')
      }

      logger.info({
        message: '🔄 Запуск generateSpeech',
        description: 'Starting generateSpeech function',
        text: testCase.text,
        telegram_id: TEST_CONFIG.users.main.telegramId,
      })

      // // Используем реальную функцию generateSpeech
      // const result = await generateSpeech({
      //   text: testCase.text,
      //   voice_id: 'ljyyJh982fsUinaSQPvv',
      //   telegram_id: TEST_CONFIG.users.main.telegramId,
      //   is_ru: TEST_CONFIG.users.main.isRussian,
      //   bot: botData.bot,
      //   bot_name: TEST_CONFIG.users.main.botName,
      // })

      // if (!result) {
      //   throw new Error('Failed to generate speech')
      // }

      // logger.info({
      //   message: '✅ Аудио успешно сгенерировано',
      //   description: 'Audio successfully generated',
      //   result_type: typeof result,
      // })

      results.push({
        success: true,
        name: `Генерация речи - ${testCase.name}`,
        message: `Аудио успешно сгенерировано и отправлено для теста "${testCase.name}"`,
        duration: 0,
      })

      logger.info({
        message: `✅ Тест "${testCase.name}" успешно завершен`,
        description: `Test "${testCase.name}" completed successfully`,
      })

      // Пауза между тестами
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Возвращаем общий результат
    return {
      success: true,
      name: 'Генерация речи',
      message: `Успешно выполнено ${results.length} тестов генерации речи`,
      duration: 0,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте генерации речи',
      description: 'Error in speech generation test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      name: 'Генерация речи',
      duration: 0,
      message: 'Ошибка при генерации речи',
    }
  }
}

async function testUserRegistrationWithoutReferral(): Promise<TestResult> {
  try {
    const ctx = {
      from: {
        id: 123456789,
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User',
        language_code: 'ru',
        is_bot: false
      },
      message: {
        text: '/start'
      },
      session: {},
      scene: {
        enter: async () => {}
      },
      reply: async () => {},
      telegram: {
        sendMessage: async () => {}
      },
      botInfo: {
        username: 'test_bot'
      }
    }

    // Вызываем createUserStep
    await createUserStep(ctx)

    return {
      success: true,
      description: 'Тест регистрации пользователя без реферальной ссылки',
      details: 'Пользователь успешно создан без реферальной ссылки'
    }
  } catch (error) {
    return {
      success: false,
      description: 'Тест регистрации пользователя без реферальной ссылки',
      details: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
