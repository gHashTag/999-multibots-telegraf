import { TestResult } from '../types'
import { Logger as logger } from '@/utils/logger'
import { Cache } from '@/core/cache'
import { CACHE_CONFIG } from '@/config/cache'

interface TestData {
  key: string
  value: string
}

export async function testCache(): Promise<TestResult> {
  const results: TestResult = {
    name: 'Тест системы кэширования',
    success: true,
    message: 'Тесты кэширования выполнены успешно',
    error: undefined,
    details: {},
    metadata: {
      startTime: Date.now(),
      testType: 'cache'
    }
  }

  logger.info('🎯 Запуск тестов кэширования:', {
    description: 'Starting cache tests'
  })

  try {
    // Создаем экземпляр кэша
    const cache = new Cache<TestData>()

    // Тест 1: Добавление и получение значения
    const testData: TestData = { key: 'test1', value: 'value1' }
    cache.set(testData.key, testData)
    const cachedData = cache.get(testData.key)

    if (!cachedData || cachedData.value !== testData.value) {
      results.success = false
      results.error = '❌ Ошибка: Значение не найдено в кэше или не совпадает'
      return results
    }

    logger.info('✅ Тест 1 - Базовые операции успешны:', {
      description: 'Basic operations test passed',
      testData,
      cachedData
    })

    // Тест 2: Проверка TTL
    const testTTLData: TestData = { key: 'test2', value: 'value2' }
    cache.set(testTTLData.key, testTTLData)
    
    // Ждем немного больше TTL
    await new Promise(resolve => setTimeout(resolve, CACHE_CONFIG.ttl + 100))
    
    const expiredData = cache.get(testTTLData.key)
    if (expiredData !== null) {
      results.success = false
      results.error = '❌ Ошибка: Значение не было удалено по TTL'
      return results
    }

    logger.info('✅ Тест 2 - TTL работает корректно:', {
      description: 'TTL test passed'
    })

    // Тест 3: Проверка принудительной очистки
    // Заполняем кэш до порога очистки
    const threshold = Math.floor(CACHE_CONFIG.maxSize * CACHE_CONFIG.cleanupThreshold)
    for (let i = 0; i < threshold + 1; i++) {
      cache.set(`key${i}`, { key: `key${i}`, value: `value${i}` })
    }

    const metrics = cache.getMetrics()
    if (metrics.size >= CACHE_CONFIG.maxSize) {
      results.success = false
      results.error = '❌ Ошибка: Принудительная очистка не сработала'
      return results
    }

    logger.info('✅ Тест 3 - Принудительная очистка работает:', {
      description: 'Forced cleanup test passed',
      metrics
    })

    // Тест 4: Проверка метрик
    const testMetricsData: TestData = { key: 'test4', value: 'value4' }
    cache.set(testMetricsData.key, testMetricsData)
    
    // Делаем несколько обращений
    cache.get(testMetricsData.key)
    cache.get(testMetricsData.key)
    cache.get('nonexistent')

    const finalMetrics = cache.getMetrics()
    if (finalMetrics.hits < 2 || finalMetrics.misses < 1) {
      results.success = false
      results.error = '❌ Ошибка: Метрики не обновляются корректно'
      return results
    }

    logger.info('✅ Тест 4 - Метрики работают корректно:', {
      description: 'Metrics test passed',
      metrics: finalMetrics
    })

    // Очистка
    cache.destroy()

    results.metadata = {
      ...results.metadata,
      endTime: Date.now()
    }

    results.details = {
      testsRun: 4,
      cacheMaxSize: CACHE_CONFIG.maxSize,
      finalMetrics
    }

    logger.info('🏁 Все тесты кэширования завершены успешно:', {
      description: 'All cache tests completed successfully',
      success: results.success,
      details: results.details
    })

  } catch (error) {
    results.success = false
    results.error = `❌ Неожиданная ошибка: ${error instanceof Error ? error.message : String(error)}`
    
    logger.error('❌ Ошибка при выполнении тестов кэширования:', {
      description: 'Error during cache test execution',
      error: error instanceof Error ? error.message : String(error)
    })
  }

  return results
} 