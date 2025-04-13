import { testGQPortrait } from './testNeuroPhotoGQ'
import { testGQPortraitBatch } from './testNeuroPhotoGQBatch'
import { testGQBusinessPortrait } from './testNeuroPhotoGQBusiness'
import { testGQFashionPortrait } from './testNeuroPhotoGQFashion'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config()

// Режим тестирования (true - имитация API, false - реальный вызов API)
const TEST_MODE = process.env.TEST_MODE === 'true' || true

// Задержка между тестами в миллисекундах
const DELAY_BETWEEN_TESTS = 2000

/**
 * Пауза выполнения на указанное время
 * @param ms Время в миллисекундах
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Основная функция для запуска всех тестов NeuroPhoto GQ Portrait
 * Запускает тест генерации портретов в стиле GQ разных типов
 */
async function runAllGQTests() {
  console.log('🚀 Запуск полного комплекта тестов для GQ Portrait...')

  try {
    // В тестовом режиме создаем директорию для результатов
    const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
    if (TEST_MODE) {
      console.log(
        '⚠️ Запуск всех тестов в тестовом режиме (без вызова реального API)'
      )

      // Создаем директорию для тестовых результатов, если она не существует
      const uploadsDir = path.join(
        process.cwd(),
        'src',
        'uploads',
        TEST_TELEGRAM_ID,
        'neuro-photo'
      )
      try {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true })
        }
        console.log(
          `✅ Директория для тестовых результатов создана: ${uploadsDir}`
        )
      } catch (error) {
        console.error('❌ Ошибка при создании директории:', error)
      }
    }

    // Базовый GQ портрет
    console.log('\n📌 [1/4] Запуск базового теста GQ Portrait')
    await testGQPortrait()

    // Пауза между тестами
    console.log(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Бизнес GQ портрет
    console.log('\n📌 [2/4] Запуск теста Business GQ Portrait')
    await testGQBusinessPortrait()

    // Пауза между тестами
    console.log(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Модный GQ портрет
    console.log('\n📌 [3/4] Запуск теста Fashion GQ Portrait')
    await testGQFashionPortrait()

    // Пауза между тестами
    console.log(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Пакетный тест GQ портретов (разные вариации)
    console.log('\n📌 [4/4] Запуск пакетного теста GQ Portrait Batch')
    await testGQPortraitBatch()

    console.log('\n✅ Все тесты GQ Portrait успешно завершены!')
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов для GQ Portrait:', error)
    process.exit(1)
  }
}

// Запускаем тестер, если файл вызван напрямую
if (require.main === module) {
  runAllGQTests().catch(error => {
    console.error('❌ Необработанная ошибка в GQAllTester:', error)
    process.exit(1)
  })
}

export { runAllGQTests }
