import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import { logger } from '@/utils/logger'

/**
 * Тестер для базовых Inngest функций
 */
const tester = new InngestFunctionTester({
  verbose: true
})

/**
 * Тест функции тренировки модели
 */
export async function testModelTraining() {
  logger.info('Запуск теста тренировки модели')
  return tester.testModelTraining()
}

/**
 * Тест функции генерации нейрофото
 */
export async function testNeuroPhotoGeneration() {
  logger.info('Запуск теста генерации нейрофото')
  return tester.testNeuroImageGeneration()
}

/**
 * Тест функции генерации нейрофото V2
 */
export async function testNeuroPhotoV2Generation() {
  logger.info('Запуск теста генерации нейрофото V2')
  return tester.testNeuroPhotoV2Generation()
}

/**
 * Тест функции текст-в-видео
 */
export async function testTextToVideo() {
  logger.info('Запуск теста текст-в-видео')
  return tester.testTextToVideo()
}

/**
 * Запускает все базовые тесты Inngest функций
 */
export async function runAllBasicTests() {
  logger.info('Запуск всех базовых тестов Inngest функций')
  const results = []
  
  try {
    results.push(await testModelTraining())
  } catch (error) {
    logger.error('Ошибка при тестировании тренировки модели', error)
    results.push({ success: false, error })
  }
  
  try {
    results.push(await testNeuroPhotoGeneration())
  } catch (error) {
    logger.error('Ошибка при тестировании генерации нейрофото', error)
    results.push({ success: false, error })
  }
  
  try {
    results.push(await testNeuroPhotoV2Generation())
  } catch (error) {
    logger.error('Ошибка при тестировании генерации нейрофото V2', error)
    results.push({ success: false, error })
  }
  
  try {
    results.push(await testTextToVideo())
  } catch (error) {
    logger.error('Ошибка при тестировании текст-в-видео', error)
    results.push({ success: false, error })
  }
  
  return results
} 