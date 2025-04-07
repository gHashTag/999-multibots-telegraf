import { logger } from '@/utils/logger'
import { InngestFunction } from 'inngest'

interface InngestTestEngineOptions {
  maxWaitTime?: number
  eventBufferSize?: number
}

/**
 * Тестовый движок для Inngest функций
 * Позволяет отслеживать отправленные события и симулировать работу Inngest
 */
export class InngestTestEngine {
  private events: any[] = []
  private registeredFunctions: Map<string, any> = new Map()
  private options: InngestTestEngineOptions

  constructor(options: InngestTestEngineOptions = {}) {
    this.options = {
      maxWaitTime: options.maxWaitTime || 10000,
      eventBufferSize: options.eventBufferSize || 200,
    }

    logger.info('🔧 Инициализация тестового движка Inngest', {
      description: 'Initializing Inngest test engine',
      options: this.options,
    })
  }

  /**
   * Регистрирует функцию для обработки события
   */
  register(eventName: string, handler: any) {
    logger.info('📝 Регистрация функции', {
      description: 'Registering function',
      event_name: eventName,
    })
    this.registeredFunctions.set(eventName, handler)
  }

  /**
   * Создает объект step для выполнения функции
   */
  private createStepObject() {
    return {
      run: async (name: string, fn: () => Promise<any>) => {
        logger.info('🔄 Выполнение шага', {
          description: 'Running step',
          step_name: name,
        })
        try {
          const result = await fn()
          logger.info('✅ Шаг выполнен успешно', {
            description: 'Step completed successfully',
            step_name: name,
            result,
          })
          return result
        } catch (error) {
          logger.error('❌ Ошибка при выполнении шага', {
            description: 'Error executing step',
            step_name: name,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      },
    }
  }

  /**
   * Отправить событие в тестовый движок
   */
  async send(event: any) {
    logger.info('📨 Отправка события в тестовый движок', {
      description: 'Sending event to test engine',
      event_name: event.name,
      event_id: event.id,
      event_data: event.data,
    })

    // Добавляем событие в буфер
    const eventWithId = {
      ...event,
      id: event.id || Math.random().toString(36).substring(7),
      timestamp: new Date().toISOString(),
      status: 'pending',
    }
    this.events.push(eventWithId)

    // Ограничиваем размер буфера
    if (this.events.length > (this.options.eventBufferSize || 100)) {
      this.events.shift()
    }

    // Если есть зарегистрированная функция для этого события, выполняем её
    const handler = this.registeredFunctions.get(event.name)
    if (handler) {
      try {
        logger.info('🚀 Запуск обработчика события', {
          description: 'Starting event handler',
          event_name: event.name,
          handler_name: handler.name,
        })

        const result = await handler({
          event: eventWithId,
          step: this.createStepObject(),
        })

        logger.info('✅ Обработчик события выполнен успешно', {
          description: 'Event handler completed successfully',
          event_name: event.name,
          result,
        })

        await this.simulateExecution(eventWithId.id, result)
      } catch (error) {
        logger.error('❌ Ошибка при выполнении функции', {
          description: 'Error executing function',
          event_name: event.name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        await this.simulateExecution(eventWithId.id, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    } else {
      logger.warn('⚠️ Обработчик не найден для события', {
        description: 'No handler found for event',
        event_name: event.name,
      })
    }

    return { event: eventWithId, success: true }
  }

  /**
   * Получить все события
   */
  getEvents() {
    return this.events
  }

  /**
   * Получить событие по ID
   */
  getEventById(id: string) {
    return this.events.find(e => e.id === id)
  }

  /**
   * Получить события по имени
   */
  getEventsByName(name: string) {
    return this.events.filter(e => e.name === name)
  }

  /**
   * Очистить буфер событий
   */
  clearEvents() {
    this.events = []
    logger.info('🧹 Буфер событий очищен', {
      description: 'Event buffer cleared',
    })
  }

  /**
   * Ожидание выполнения события
   */
  async waitForEvent(
    eventName: string,
    timeout = this.options.maxWaitTime
  ): Promise<any> {
    logger.info('⏳ Ожидание события', {
      description: 'Waiting for event',
      event_name: eventName,
      timeout,
    })

    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const checkEvent = () => {
        const event = this.events.find(
          e => e.name === eventName && e.status === 'completed'
        )

        if (event) {
          logger.info('✅ Событие обнаружено', {
            description: 'Event found',
            event_name: eventName,
            event_id: event.id,
          })
          resolve(event)
          return
        }

        if (Date.now() - startTime > (timeout || 5000)) {
          logger.warn('⚠️ Таймаут ожидания события', {
            description: 'Event waiting timeout',
            event_name: eventName,
            timeout,
          })
          reject(new Error(`Timeout waiting for event: ${eventName}`))
          return
        }

        setTimeout(checkEvent, 100)
      }

      checkEvent()
    })
  }

  /**
   * Симулирует выполнение события
   */
  private async simulateExecution(eventId: string, result: any) {
    const event = this.events.find(e => e.id === eventId)
    if (event) {
      event.status = result.success ? 'completed' : 'failed'
      event.result = result
    }
  }
}
