import { InngestEvent } from '@/types'
import { logger } from '@/utils/logger'

export class InngestTestEngine {
  private eventHistory: InngestEvent<any>[] = []
  private processedEvents: InngestEvent<any>[] = []

  constructor() {
    logger.info('🔧 Initializing InngestTestEngine')
  }

  async send(event: InngestEvent<any>): Promise<void> {
    this.eventHistory.push(event)
    logger.info(`📤 Event sent: ${event.name}`)
    await this.processEvent(event)
  }

  private async processEvent(event: InngestEvent<any>): Promise<void> {
    this.processedEvents.push(event)
    logger.info(`📝 Event processed: ${event.name}`)
  }

  async clearEventHistory(): Promise<void> {
    this.eventHistory = []
    this.processedEvents = []
    logger.info('🧹 Event history cleared')
  }

  async waitForEvents(timeout: number = 1000): Promise<InngestEvent<any>[]> {
    await new Promise(resolve => setTimeout(resolve, timeout))
    logger.info('⏳ Waited for events to process')
    return this.processedEvents
  }

  async getProcessedEvents(): Promise<InngestEvent<any>[]> {
    return this.processedEvents
  }

  async getEventHistory(): Promise<InngestEvent<any>[]> {
    return this.eventHistory
  }
}

export const inngestTestEngine = new InngestTestEngine()
