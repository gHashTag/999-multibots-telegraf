import { logger } from '@/utils/logger'

export interface InngestTestEngineOptions {
  maxWaitTime?: number
  eventBufferSize?: number
}

/**
 * Тестовый движок для Inngest функций
 * Позволяет отслеживать отправленные события и симулировать работу Inngest
 */
export class InngestTestEngine {
  private events: any[] = []
  private options: InngestTestEngineOptions

  constructor(options: InngestTestEngineOptions = {}) {
    this.options = {
      maxWaitTime: 5000,
      eventBufferSize: 100,
      ...options,
    }

    logger.info('🔧 Инициализация тестового движка Inngest', {
      description: 'Initializing Inngest test engine',
      options: this.options,
    })
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
    this.events.push({
      ...event,
      timestamp: new Date().toISOString(),
      status: 'pending',
    })

    // Ограничиваем размер буфера
    if (this.events.length > (this.options.eventBufferSize || 100)) {
      this.events.shift()
    }

    return { event, success: true }
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
   * Симуляция выполнения функции
   */
  async simulateExecution(eventId: string, result: any = { success: true }) {
    const eventIndex = this.events.findIndex(e => e.id === eventId)

    if (eventIndex >= 0) {
      this.events[eventIndex] = {
        ...this.events[eventIndex],
        result,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }

      logger.info('🚀 Событие выполнено (симуляция)', {
        description: 'Event executed (simulation)',
        event_id: eventId,
        event_name: this.events[eventIndex].name,
        result,
      })

      return this.events[eventIndex]
    }

    logger.warn('⚠️ Событие не найдено для симуляции', {
      description: 'Event not found for simulation',
      event_id: eventId,
    })

    return null
  }
}
