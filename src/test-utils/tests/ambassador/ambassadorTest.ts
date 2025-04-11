import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'

/**
 * Тест интеграции Ambassador
 */
export async function testAmbassadorIntegration(): Promise<TestResult> {
  logger.info('🚀 Запуск теста интеграции Ambassador', {
    description: 'Running Ambassador integration test',
  })

  try {
    // Проверка подключения к Supabase
    const { data, error } = await supabase
      .from('ambassador_profiles')
      .select('id')
      .limit(1)

    if (error) {
      throw new Error(`Ошибка подключения к базе данных: ${error.message}`)
    }

    logger.info('✅ Успешное подключение к базе данных', {
      description: 'Successfully connected to database',
      data: data ? data.length : 0,
    })

    // Здесь может быть добавлена более сложная логика тестирования
    // интеграции с Ambassador в будущем

    return {
      success: true,
      message: 'Ambassador integration test completed successfully',
      name: 'testAmbassadorIntegration',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте интеграции Ambassador', {
      description: 'Error in Ambassador integration test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'testAmbassadorIntegration',
    }
  }
}
