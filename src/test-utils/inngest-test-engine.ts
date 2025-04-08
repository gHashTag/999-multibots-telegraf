import { logger } from '../utils/logger'
import { InngestFunction } from 'inngest'

export interface InngestOptions {
  timeout?: number
  maxWaitTime?: number
  eventBufferSize?: number
}

export interface InngestEvent {
  name: string
  data: any
  status?: string
  result?: any
  error?: Error
}

export interface StepObject {
  id: string
  name: string
  data: Record<string, any>
}

export class InngestTestEngine {
  private registeredFunctions: Map<
    string,
    { fn: InngestFunction<any, any, any> | Function }
  > = new Map()
  private events: InngestEvent[] = []
  private readonly options: InngestOptions

  constructor(options: InngestOptions = {}) {
    this.options = options
    console.log('🚀 Initializing InngestTestEngine')
  }

  async init() {
    // Use options if needed for initialization
    const { timeout = 5000 } = this.options
    console.log(`⚙️ Initializing with timeout: ${timeout}ms`)
    return this
  }

  registerEventHandler(
    eventName: string,
    handler: InngestFunction<any, any, any> | Function
  ) {
    console.log(`📝 Registering handler for event: ${eventName}`)
    this.registeredFunctions.set(eventName, { fn: handler })
  }

  // Alias for registerEventHandler for backward compatibility
  register(
    eventName: string,
    handler: InngestFunction<any, any, any> | Function
  ) {
    return this.registerEventHandler(eventName, handler)
  }

  async send(inngestEvent: InngestEvent): Promise<any> {
    try {
      const handler = this.registeredFunctions.get(inngestEvent.name)

      if (!handler) {
        throw new Error(`Handler not found for event: ${inngestEvent.name}`)
      }

      inngestEvent.status = 'PROCESSING'
      this.events.push(inngestEvent)

      logger.info('🔄 Обработка события', {
        description: 'Processing event',
        event: inngestEvent.name,
        data: inngestEvent.data,
      })

      const handlerFn = handler.fn
      if (typeof handlerFn !== 'function') {
        throw new Error('Handler must be a function')
      }

      const result = await handlerFn({
        event: this.createStepObject(inngestEvent),
        step: {
          run: async (_name: string, fn: Function) => {
            return await fn()
          },
        },
      })

      inngestEvent.status = 'COMPLETED'
      inngestEvent.result = result

      logger.info('✅ Событие обработано успешно', {
        description: 'Event processed successfully',
        event: inngestEvent.name,
        result,
      })

      return result
    } catch (error) {
      inngestEvent.status = 'FAILED'
      inngestEvent.error =
        error instanceof Error ? error : new Error(String(error))

      logger.error('❌ Ошибка при обработке события', {
        description: 'Error processing event',
        event: inngestEvent.name,
        error: inngestEvent.error,
      })

      throw error
    }
  }

  private createStepObject(event: InngestEvent): StepObject {
    return {
      id: Math.random().toString(36).substring(7),
      name: event.name,
      data: event.data,
    }
  }

  getEvents(): InngestEvent[] {
    return this.events
  }

  clearEvents(): void {
    this.events = []
  }
}
