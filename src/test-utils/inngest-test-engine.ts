import { logger } from '@/utils/logger'

interface InngestTestEngineOptions {
  maxWaitTime?: number
  eventBufferSize?: number
}

interface InngestEvent {
  id: string
  name: string
  data: any
  ts: number
}

export class InngestTestEngine {
  private handlers: Map<string, (event: any) => Promise<any>>
  private events: InngestEvent[]
  private maxWaitTime: number
  private eventBufferSize: number

  constructor(options: InngestTestEngineOptions = {}) {
    this.handlers = new Map()
    this.events = []
    this.maxWaitTime = options.maxWaitTime || 10000
    this.eventBufferSize = options.eventBufferSize || 200

    logger.info('🔧 Инициализация тестового движка Inngest', {
      description: 'Initializing Inngest test engine',
      options: {
        maxWaitTime: this.maxWaitTime,
        eventBufferSize: this.eventBufferSize,
      },
    })
  }

  register(eventName: string, handler: (event: any) => Promise<any>) {
    logger.info('📝 Регистрация функции', {
      description: 'Registering function',
      event_name: eventName,
    })
    this.handlers.set(eventName, handler)
  }

  async send(event: { name: string; data: any }) {
    const id = Math.random().toString(36).substring(7)
    const ts = Date.now()

    const inngestEvent = {
      id,
      name: event.name,
      data: event.data,
      ts,
    }

    this.events.push(inngestEvent)

    // Ограничиваем размер буфера событий
    if (this.events.length > this.eventBufferSize) {
      this.events.shift()
    }

    const handler = this.handlers.get(event.name)
    if (handler) {
      try {
        logger.info('🚀 Начало обработки события', {
          description: 'Starting event processing',
          event_name: event.name,
          event_id: id,
        })

        const result = await handler({ event: inngestEvent })

        logger.info('✅ Событие успешно обработано', {
          description: 'Event processed successfully',
          event_name: event.name,
          event_id: id,
          result,
        })

        return { id, ts, result }
      } catch (error) {
        logger.error('❌ Ошибка при обработке события', {
          description: 'Error processing event',
          event_name: event.name,
          event_id: id,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }

    return { id, ts }
  }

  getEvents() {
    return this.events
  }

  clearEvents() {
    this.events = []
  }
}
