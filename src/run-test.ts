#!/usr/bin/env node

import {
  apiTests,
  paymentTests,
  inngestTests,
  neuroTests,
  systemTests,
  TestResult,
} from './test-utils'

// Типы категорий тестов
type TestCategory =
  | 'api'
  | 'database'
  | 'inngest'
  | 'neuro'
  | 'payment'
  | 'speech'
  | 'translations'
  | 'webhook'
  | 'system'

/**
 * Запуск тестов в соответствии с указанной категорией
 * @param {TestCategory} category - Категория тестов для запуска
 */
async function runTestsForCategory(category: TestCategory): Promise<void> {
  console.log(`🚀 Запуск тестов категории: ${category}`)

  try {
    let results: TestResult[] = []

    switch (category) {
      case 'api':
        results = await apiTests.runApiTests()
        break
      case 'database':
        console.log('ℹ️ Тесты базы данных пока не реализованы')
        results = []
        break
      case 'inngest':
        results = await Promise.all([
          inngestTests.runInngestDirectTest(),
          inngestTests.runInngestSDKTest(),
          inngestTests.runInngestFunctionRegistrationTest(),
          inngestTests.runInngestFullTest(),
        ])
        break
      case 'neuro':
        results = await Promise.all([neuroTests.runNeuroPhotoTests()])
        break
      case 'payment':
        results = await Promise.all([
          paymentTests.runBalanceTests(),
          paymentTests.runPaymentNotificationTests(),
        ])
        break
      case 'speech':
        console.log('ℹ️ Тесты речи пока не реализованы')
        results = []
        break
      case 'translations':
        console.log('ℹ️ Тесты переводов пока не реализованы')
        results = []
        break
      case 'webhook':
        console.log('ℹ️ Тесты вебхуков пока не реализованы')
        results = []
        break
      case 'system':
        results = await systemTests.runSystemTests()
        break
      default:
        console.error(`❌ Неизвестная категория тестов: ${category}`)
        process.exit(1)
    }

    // Вывод статистики по результатам тестов
    const totalTests = results.length
    const passedTests = results.filter(result => result.success).length
    const failedTests = totalTests - passedTests

    console.log('\n📊 Статистика тестов:')
    console.log(`✅ Пройдено: ${passedTests}/${totalTests}`)

    if (failedTests > 0) {
      console.log(`❌ Не пройдено: ${failedTests}/${totalTests}`)

      // Вывод информации о непройденных тестах
      console.log('\n❌ Непройденные тесты:')
      results
        .filter(result => !result.success)
        .forEach(result => {
          console.log(`   ❌ ${result.name}: ${result.message}`)
        })

      process.exit(1)
    } else {
      console.log('🎉 Все тесты успешно пройдены!')
      process.exit(0)
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Ошибка при запуске тестов: ${errorMessage}`)
    process.exit(1)
  }
}

/**
 * Запуск всех тестов
 */
async function runAllTests(): Promise<void> {
  console.log('🚀 Запуск всех тестов')

  // Список всех категорий тестов
  const categories: TestCategory[] = [
    'api',
    'database',
    'inngest',
    'neuro',
    'payment',
    'speech',
    'translations',
    'webhook',
    'system',
  ]

  // Запуск тестов для каждой категории
  for (const category of categories) {
    await runTestsForCategory(category)
  }
}

/**
 * Вывод справки по использованию
 */
function showHelp(): void {
  console.log(`
🧪 Утилита запуска тестов NeuroBlogger

Использование:
  npm run test [категория]

Категории тестов:
  api          - API тесты
  database     - Тесты базы данных
  inngest      - Тесты Inngest функций
  neuro        - Тесты нейросетевых функций
  payment      - Тесты платежей
  speech       - Тесты речи
  translations - Тесты переводов
  webhook      - Тесты вебхуков
  system       - Системные тесты
  
Без указания категории будут запущены все тесты.
  `)
}

/**
 * Основная функция запуска
 */
async function main(): Promise<void> {
  // Получение аргументов командной строки
  const args = process.argv.slice(2)

  // Если запрошена справка
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    return
  }

  // Запуск тестов в зависимости от переданных аргументов
  if (args.length === 0) {
    await runAllTests()
  } else {
    const category = args[0] as TestCategory
    await runTestsForCategory(category)
  }
}

// Запуск скрипта
main().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error)
  console.error(`❌ Критическая ошибка: ${errorMessage}`)
  process.exit(1)
})
