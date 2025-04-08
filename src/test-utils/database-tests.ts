import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TestResult } from './types'

/**
 * Класс для тестирования базы данных
 */
export class DatabaseTester {
  /**
   * Проверяет соединение с базой данных
   */
  async testConnection(): Promise<TestResult> {
    try {
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (error) {
        throw new Error(error.message)
      }

      logger.info({
        message: '🧪 Тест подключения к базе данных',
        description: 'Database connection test',
        count,
      })

      return {
        name: 'Database Connection Test',
        success: true,
        message: `Успешное подключение к базе данных. Количество пользователей: ${count}`,
        startTime: Date.now(),
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      logger.error({
        message: '❌ Ошибка подключения к базе данных',
        description: 'Database connection error',
        error,
      })

      return {
        name: 'Database Connection Test',
        success: false,
        message: 'Ошибка подключения к базе данных',
        error,
        startTime: Date.now(),
      }
    }
  }

  /**
   * Проверяет наличие тренировки по ID
   */
  async testTrainingExists(trainingId: string): Promise<TestResult> {
    const testName = `Training existence test: ${trainingId}`

    try {
      logger.info({
        message: '🧪 Тест наличия тренировки',
        description: 'Training existence test',
        trainingId,
      })

      // Пробуем найти тренировку
      const { data, error } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('replicate_training_id', trainingId)
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Код ошибки, когда запись не найдена
          return {
            name: testName,
            success: false,
            message: `Тренировка ${trainingId} не найдена в базе данных`,
            startTime: Date.now(),
          }
        }
        throw new Error(error.message)
      }

      logger.info({
        message: '✅ Тренировка найдена',
        description: 'Training found',
        training: {
          id: data.id,
          modelName: data.model_name,
          status: data.status,
          createdAt: data.created_at,
        },
      })

      return {
        name: testName,
        success: true,
        message: `Тренировка ${trainingId} найдена в базе данных`,
        startTime: Date.now(),
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      logger.error({
        message: '❌ Ошибка при проверке наличия тренировки',
        description: 'Error during training existence test',
        error,
        trainingId,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при поиске тренировки',
        error,
        startTime: Date.now(),
      }
    }
  }

  /**
   * Проверяет последние тренировки пользователя
   */
  async testUserTrainings(telegramId: string): Promise<TestResult> {
    const testName = `User trainings test: ${telegramId}`

    try {
      logger.info({
        message: '🧪 Тест тренировок пользователя',
        description: 'User trainings test',
        telegramId,
      })

      // Получаем тренировки пользователя
      const { data, error } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        throw new Error(error.message)
      }

      const trainingsCount = data.length

      const trainings = data.map(t => ({
        id: t.id,
        modelName: t.model_name,
        status: t.status,
        createdAt: t.created_at,
      }))

      logger.info({
        message: '✅ Тренировки пользователя получены',
        description: 'User trainings retrieved',
        trainings,
      })

      return {
        name: testName,
        success: true,
        message: `Найдено ${trainingsCount} тренировок пользователя ${telegramId}`,
        startTime: Date.now(),
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      logger.error({
        message: '❌ Ошибка при получении тренировок пользователя',
        description: 'Error during user trainings test',
        error,
        telegramId,
      })

      return {
        name: testName,
        success: false,
        message: 'Ошибка при получении тренировок пользователя',
        error,
        startTime: Date.now(),
      }
    }
  }

  /**
   * Запускает все тесты базы данных
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []

    // Тест соединения
    const connectionResult = await this.testConnection()
    results.push(connectionResult)

    // Если соединение успешно, запускаем остальные тесты
    if (connectionResult.success) {
      // Тест наличия тренировки
      const trainingResult = await this.testTrainingExists('test-training-1')
      results.push(trainingResult)

      // Тест тренировок пользователя
      const userTrainingsResult = await this.testUserTrainings('123456789')
      results.push(userTrainingsResult)
    }

    return results
  }
}
