import { testSupabase } from './test-env'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'

/**
 * Интерфейс для результатов тестирования
 */
interface TestResult {
  testName: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
}

/**
 * Класс для тестирования базы данных
 */
export class DatabaseTester {
  /**
   * Проверяет соединение с базой данных
   */
  async testConnection(): Promise<TestResult> {
    const startTime = Date.now()
    const testName = 'Database connection test'

    try {
      logger.info({
        message: '🧪 Тест соединения с базой данных',
        description: 'Database connection test',
      })

      // Делаем простой запрос к базе данных
      const { error, count } = await testSupabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .limit(1)

      if (error) {
        throw new Error(error.message)
      }

      const duration = Date.now() - startTime
      return {
        testName,
        success: true,
        message: `Соединение с базой данных установлено за ${duration}мс`,
        details: { count },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при тестировании соединения с базой данных',
        description: 'Error during database connection test',
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return {
        testName,
        success: false,
        message: 'Ошибка при соединении с базой данных',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Проверяет наличие тренировки по ID
   */
  async testTrainingExists(trainingId: string): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Training existence test: ${trainingId}`

    try {
      logger.info({
        message: '🧪 Тест наличия тренировки',
        description: 'Training existence test',
        trainingId,
      })

      // Пробуем найти тренировку
      const { data, error } = await testSupabase
        .from('model_trainings')
        .select('*')
        .eq('replicate_training_id', trainingId)
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Код ошибки, когда запись не найдена
          const duration = Date.now() - startTime
          return {
            testName,
            success: false,
            message: `Тренировка ${trainingId} не найдена в базе данных`,
            details: { error },
            duration,
          }
        }
        throw new Error(error.message)
      }

      const duration = Date.now() - startTime
      return {
        testName,
        success: true,
        message: `Тренировка ${trainingId} найдена в базе данных`,
        details: {
          training: {
            id: data.id,
            modelName: data.model_name,
            status: data.status,
            createdAt: data.created_at,
          },
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при проверке наличия тренировки',
        description: 'Error during training existence test',
        error: error instanceof Error ? error.message : 'Unknown error',
        trainingId,
      })

      return {
        testName,
        success: false,
        message: 'Ошибка при поиске тренировки',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Проверяет последние тренировки пользователя
   */
  async testUserTrainings(telegramId: string): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `User trainings test: ${telegramId}`

    try {
      logger.info({
        message: '🧪 Тест тренировок пользователя',
        description: 'User trainings test',
        telegramId,
      })

      // Получаем тренировки пользователя
      const { data, error } = await testSupabase
        .from('model_trainings')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        throw new Error(error.message)
      }

      const trainingsCount = data.length

      const duration = Date.now() - startTime
      return {
        testName,
        success: true,
        message: `Найдено ${trainingsCount} тренировок пользователя ${telegramId}`,
        details: {
          trainings: data.map(t => ({
            id: t.id,
            modelName: t.model_name,
            status: t.status,
            createdAt: t.created_at,
          })),
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при получении тренировок пользователя',
        description: 'Error during user trainings test',
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId,
      })

      return {
        testName,
        success: false,
        message: 'Ошибка при получении тренировок пользователя',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      }
    }
  }

  /**
   * Запускает все тесты базы данных
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: '🧪 Запуск всех тестов базы данных',
      description: 'Running all database tests',
    })

    try {
      // Тест соединения
      const connectionResult = await this.testConnection()
      results.push(connectionResult)

      // Если соединение не установлено, прерываем остальные тесты
      if (!connectionResult.success) {
        logger.error({
          message: '❌ Тесты базы данных прерваны из-за ошибки соединения',
          description: 'Database tests aborted due to connection error',
        })

        return results
      }

      // Тест наличия тренировки из конфигурации
      const trainingId = TEST_CONFIG.modelTraining.samples[0].trainingId
      const trainingResult = await this.testTrainingExists(trainingId)
      results.push(trainingResult)

      // Тест тренировок пользователя
      const telegramId = TEST_CONFIG.users.main.telegramId
      const userTrainingsResult = await this.testUserTrainings(telegramId)
      results.push(userTrainingsResult)

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты базы данных завершены: ${successful}/${total} успешно`,
        description: 'Database tests completed',
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов базы данных',
        description: 'Critical error during database tests',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
}
