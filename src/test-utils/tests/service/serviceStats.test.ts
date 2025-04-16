import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { getServiceUsageStats } from '@/utils/service.utils'

/**
 * Запускает тесты статистики сервисов
 */
export async function runServiceStatsTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов статистики сервисов', {
    description: 'Running service stats tests',
  })

  const results: TestResult[] = []

  try {
    // Запускаем все тесты
    results.push(await testGetServiceStats())
    results.push(await testEmptyServiceStats())
    results.push(await testInvalidServiceType())

    // Отчет о результатах
    const passedTests = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info(
      `✅ Завершено ${passedTests}/${totalTests} тестов статистики сервисов`,
      {
        description: 'Service stats tests completed',
        passedTests,
        totalTests,
      }
    )

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов статистики сервисов', {
      description: 'Error running service stats tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [
      {
        success: false,
        name: 'Service Stats Tests',
        message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
}

async function testGetServiceStats(): Promise<TestResult> {
  const testName = 'Получение статистики сервиса'

  try {
    // Создаем тестовые данные
    const testStats = {
      service_type: ModeEnum.TextToImage,
      total_requests: 100,
      successful_requests: 90,
      failed_requests: 10,
      average_response_time: 1500,
      last_used: new Date().toISOString(),
    }

    // Добавляем статистику в базу
    await supabase.from('service_usage_stats').upsert(testStats)

    // Получаем статистику через функцию
    const stats = await getServiceUsageStats(ModeEnum.TextToImage)

    // Проверяем соответствие данных
    if (
      stats.totalRequests !== testStats.total_requests ||
      stats.successfulRequests !== testStats.successful_requests ||
      stats.failedRequests !== testStats.failed_requests ||
      stats.averageResponseTime !== testStats.average_response_time
    ) {
      throw new Error('Полученная статистика не соответствует тестовым данным')
    }

    // Очищаем тестовые данные
    await supabase
      .from('service_usage_stats')
      .delete()
      .eq('service_type', ModeEnum.TextToImage)

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testEmptyServiceStats(): Promise<TestResult> {
  const testName = 'Получение статистики несуществующего сервиса'

  try {
    // Очищаем статистику если есть
    await supabase
      .from('service_usage_stats')
      .delete()
      .eq('service_type', ModeEnum.TextToVideo)

    // Получаем статистику через функцию
    const stats = await getServiceUsageStats(ModeEnum.TextToVideo)

    // Проверяем, что получены нулевые значения
    if (
      stats.totalRequests !== 0 ||
      stats.successfulRequests !== 0 ||
      stats.failedRequests !== 0 ||
      stats.averageResponseTime !== 0
    ) {
      throw new Error('Получены ненулевые значения для пустой статистики')
    }

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function testInvalidServiceType(): Promise<TestResult> {
  const testName = 'Обработка некорректного типа сервиса'

  try {
    // Пытаемся получить статистику с некорректным типом
    const invalidType = 'InvalidService' as ModeEnum
    const stats = await getServiceUsageStats(invalidType)

    // Проверяем, что получены нулевые значения
    if (
      stats.totalRequests !== 0 ||
      stats.successfulRequests !== 0 ||
      stats.failedRequests !== 0 ||
      stats.averageResponseTime !== 0
    ) {
      throw new Error(
        'Получены ненулевые значения для некорректного типа сервиса'
      )
    }

    return {
      success: true,
      name: testName,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error(`❌ Ошибка в тесте: ${testName}`, {
      description: 'Error in test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testName,
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
