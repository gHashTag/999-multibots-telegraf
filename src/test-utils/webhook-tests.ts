import axios from 'axios'
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { TrainingWithUser } from '@/core/supabase/getTrainingWithUser'

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
 * Класс для тестирования веб-хуков Replicate
 */
export class ReplicateWebhookTester {
  private apiUrl: string
  private webhookPath: string

  constructor() {
    this.apiUrl = TEST_CONFIG.server.apiUrl
    this.webhookPath = TEST_CONFIG.server.webhookPath
  }

  /**
   * Отправляет тестовый веб-хук на сервер
   */
  async sendWebhook(config: any): Promise<TestResult> {
    const startTime = Date.now()
    const testName = `Webhook test: ${config.status} status for training ${config.id}`

    try {
      logger.info({
        message: '🧪 Запуск теста веб-хука',
        description: 'Starting webhook test',
        testName,
        config,
      })

      // Проверяем существование тренировки в базе перед тестом
      let trainingBefore: TrainingWithUser | null = null
      try {
        const { data, error } = await supabase
          .from('model_trainings')
          .select('*')
          .eq('replicate_training_id', config.id)
          .limit(1)
          .single()

        if (!error && data) {
          trainingBefore = data as unknown as TrainingWithUser
          logger.info({
            message: '🔍 Тренировка найдена в базе перед тестом',
            description: 'Found training in database before test',
            trainingId: config.id,
            status: trainingBefore.status,
          })
        } else {
          logger.warn({
            message: '⚠️ Тренировка не найдена в базе перед тестом',
            description: 'Training not found in database before test',
            trainingId: config.id,
            error: error?.message,
          })
        }
      } catch (dbError) {
        logger.error({
          message: '❌ Ошибка при проверке базы перед тестом',
          description: 'Error checking database before test',
          error: dbError.message,
        })
      }

      // Отправляем запрос на веб-хук
      const response = await axios.post(
        `${this.apiUrl}${this.webhookPath}`,
        config,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      logger.info({
        message: '📤 Отправлен тестовый веб-хук',
        description: 'Webhook test sent',
        status: response.status,
        responseData: response.data,
      })

      // Даем время для обработки и обновления базы данных
      await new Promise(resolve => setTimeout(resolve, 500))

      // Проверяем обновление статуса в базе данных
      let trainingAfter: TrainingWithUser | null = null
      let statusUpdated = false
      try {
        const { data, error } = await supabase
          .from('model_trainings')
          .select('*')
          .eq('replicate_training_id', config.id)
          .limit(1)
          .single()

        if (!error && data) {
          trainingAfter = data as unknown as TrainingWithUser

          // Проверяем обновился ли статус
          if (
            trainingBefore &&
            trainingBefore.status !== trainingAfter.status
          ) {
            statusUpdated = true
            logger.info({
              message: '✅ Статус в базе данных обновлен',
              description: 'Database status updated',
              trainingId: config.id,
              oldStatus: trainingBefore.status,
              newStatus: trainingAfter.status,
            })
          } else {
            logger.warn({
              message: '⚠️ Статус в базе данных не изменился',
              description: 'Database status not changed',
              trainingId: config.id,
              status: trainingAfter.status,
            })
          }
        }
      } catch (dbError) {
        logger.error({
          message: '❌ Ошибка при проверке базы после теста',
          description: 'Error checking database after test',
          error: dbError.message,
        })
      }

      const duration = Date.now() - startTime
      return {
        testName,
        success: response.status === 200,
        message: `Вебхук успешно обработан за ${duration}мс`,
        details: {
          response: response.data,
          statusCode: response.status,
          statusUpdated,
          trainingBefore: trainingBefore
            ? {
                id: trainingBefore.id,
                status: trainingBefore.status,
              }
            : null,
          trainingAfter: trainingAfter
            ? {
                id: trainingAfter.id,
                status: trainingAfter.status,
              }
            : null,
        },
        duration,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error({
        message: '❌ Ошибка при тестировании веб-хука',
        description: 'Error during webhook test',
        error: error.message,
        testName,
      })

      return {
        testName,
        success: false,
        message: 'Ошибка при отправке тестового вебхука',
        error: error.message,
        duration,
      }
    }
  }

  /**
   * Запускает тест успешного завершения тренировки
   */
  async testSucceededTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.modelTraining.samples[0]
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: sample.status,
      output: sample.output,
      metrics: sample.metrics,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Запускает тест ошибки тренировки
   */
  async testFailedTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.modelTraining.samples[1]
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: sample.status,
      error: sample.error,
      logs: sample.logs,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Запускает тест отмены тренировки
   */
  async testCanceledTraining(): Promise<TestResult> {
    const sample = TEST_CONFIG.modelTraining.samples[2]
    const payload = {
      id: sample.trainingId,
      model: 'ostris/flux-dev-lora-trainer',
      version:
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      status: sample.status,
    }

    return this.sendWebhook(payload)
  }

  /**
   * Запускает все тесты веб-хуков
   */
  async runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = []
    logger.info({
      message: '🧪 Запуск всех тестов веб-хуков',
      description: 'Running all webhook tests',
    })

    try {
      // Тест успешного завершения
      const successResult = await this.testSucceededTraining()
      results.push(successResult)

      // Тест ошибки
      const failureResult = await this.testFailedTraining()
      results.push(failureResult)

      // Тест отмены
      const cancelResult = await this.testCanceledTraining()
      results.push(cancelResult)

      // Считаем общую статистику
      const successful = results.filter(r => r.success).length
      const total = results.length

      logger.info({
        message: `🏁 Тесты веб-хуков завершены: ${successful}/${total} успешно`,
        description: 'Webhook tests completed',
        successCount: successful,
        totalCount: total,
      })

      return results
    } catch (error) {
      logger.error({
        message: '❌ Критическая ошибка при выполнении тестов веб-хуков',
        description: 'Critical error during webhook tests',
        error: error.message,
      })
      throw error
    }
  }
}
