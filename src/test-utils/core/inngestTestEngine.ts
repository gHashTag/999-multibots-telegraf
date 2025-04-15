import { logger } from '@/utils/logger'

export interface InngestEvent {
  name: string
  data: Record<string, any>
}

class InngestTestEngine {
  private events: InngestEvent[] = []
  private processedEvents: InngestEvent[] = []

  constructor() {
    logger.info('🔧 Initializing InngestTestEngine')
  }

  async send(event: InngestEvent): Promise<void> {
    this.events.push(event)
    logger.info(`📤 Event sent: ${event.name}`)
    // Имитируем обработку события
    await this.processEvent(event)
  }

  private async processEvent(event: InngestEvent): Promise<void> {
    // Здесь можно добавить логику обработки конкретных типов событий
    this.processedEvents.push(event)
    logger.info(`✅ Event processed: ${event.name}`)
  }

  async clearEventHistory(): Promise<void> {
    this.events = []
    this.processedEvents = []
    logger.info('🧹 Event history cleared')
  }

  async waitForEvents(timeout: number = 1000): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, timeout))
    logger.info('⏳ Waited for events to process')
  }

  async getProcessedEvents(): Promise<InngestEvent[]> {
    return this.processedEvents
  }

  async getEventHistory(): Promise<InngestEvent[]> {
    return [...this.events, ...this.processedEvents]
  }
}

export const inngestTestEngine = new InngestTestEngine()
