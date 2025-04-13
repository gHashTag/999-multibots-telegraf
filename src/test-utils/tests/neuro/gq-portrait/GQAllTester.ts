import { testGQPortrait } from './testNeuroPhotoGQ'
import { testGQBusinessPortrait } from './testNeuroPhotoGQBusiness'
import { testGQFashionPortrait } from './testNeuroPhotoGQFashion'
import { testGQArtisticPortrait } from './testNeuroPhotoGQArtistic'
import { testNeuroPhotoGQBatch } from './testNeuroPhotoGQBatch'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import { logger } from '../../../../lib/logger'
import { TestResult } from '../../../types'

dotenv.config()

// Режим тестирования (true - имитация API, false - реальный вызов API)
const TEST_MODE = process.env.TEST_MODE === 'true' || false

// Задержка между тестами в миллисекундах
const DELAY_BETWEEN_TESTS = 2000

// Пауза между тестами
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Основная функция для запуска всех тестов NeuroPhoto GQ Portrait
 * Запускает тест генерации портретов в стиле GQ разных типов
 */
async function runAllGQTests(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск всех тестов для GQ портретов')

    // В тестовом режиме создаем директорию для результатов
    const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '144022504'
    if (TEST_MODE) {
      logger.info(
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
        logger.info(
          `✅ Директория для тестовых результатов создана: ${uploadsDir}`
        )
      } catch (error) {
        logger.error('❌ Ошибка при создании директории:', error)
      }
    }

    // Базовый GQ портрет
    logger.info('\n📌 [1/5] Запуск базового теста GQ Portrait')
    await testGQPortrait()
    logger.info('✅ [1/5] Тест для базового GQ портрета завершен')

    // Пауза между тестами
    logger.info(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Бизнес GQ портрет
    logger.info('\n📌 [2/5] Запуск теста Business GQ Portrait')
    await testGQBusinessPortrait()
    logger.info('✅ [2/5] Тест для бизнес GQ портрета завершен')

    // Пауза между тестами
    logger.info(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Модный GQ портрет
    logger.info('\n📌 [3/5] Запуск теста Fashion GQ Portrait')
    await testGQFashionPortrait()
    logger.info('✅ [3/5] Тест для модного GQ портрета завершен')

    // Пауза между тестами
    logger.info(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Художественный GQ портрет
    logger.info('\n📌 [4/5] Запуск теста Artistic GQ Portrait')
    await testGQArtisticPortrait()
    logger.info('✅ [4/5] Тест для художественного GQ портрета завершен')

    // Пауза между тестами
    logger.info(`⏱️ Пауза между тестами (${DELAY_BETWEEN_TESTS}ms)`)
    await sleep(DELAY_BETWEEN_TESTS)

    // Пакетный тест GQ портретов (разные вариации)
    logger.info('\n📌 [5/5] Запуск пакетного теста GQ Portrait Batch')
    await testNeuroPhotoGQBatch()
    logger.info('✅ [5/5] Тест пакетной генерации GQ портретов завершен')

    logger.info('🏁 Все тесты для GQ портретов успешно завершены')

    return {
      success: true,
      message: 'Все тесты для GQ портретов успешно выполнены',
      name: 'GQ Tests Suite',
    }
  } catch (error: any) {
    logger.error(`❌ Ошибка при запуске тестов GQ портретов: ${error.message}`)
    return {
      success: false,
      message: `Ошибка при запуске тестов GQ портретов: ${error.message}`,
      name: 'GQ Tests Suite',
    }
  }
}

// Запускаем тестер, если файл вызван напрямую
if (require.main === module) {
  runAllGQTests().catch(error => {
    console.error('❌ Ошибка при запуске тестов GQ портретов:', error)
    process.exit(1)
  })
}

export { runAllGQTests }
