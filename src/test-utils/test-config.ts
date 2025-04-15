import { logger } from '@/utils/logger'

export interface TestConfig {
  testUser: {
    telegram_id: string
  }
  testAmount: number
  testDescription: string
  testBotName: string
}

export const TEST_CONFIG: TestConfig = {
  testUser: {
    telegram_id: '123456789',
  },
  testAmount: 100,
  testDescription: 'Test payment',
  testBotName: 'test_bot',
}

export class TestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TestError'
  }
}

export interface TestEvent {
  name: string
  data: unknown
  timestamp?: number
}

export class TestEngine {
  private events: TestEvent[] = []
  private queryResults: Map<string, unknown> = new Map()

  clearEvents(): void {
    logger.info('🧹 Очистка событий тестового движка')
    this.events = []
  }

  async sendEvent(event: TestEvent): Promise<void> {
    logger.info(`🚀 Отправка события ${event.name}`, { event })
    this.events.push({
      ...event,
      timestamp: Date.now(),
    })
  }

  getEvents(): TestEvent[] {
    return this.events
  }

  hasEvent(eventName: string): boolean {
    return this.events.some(event => event.name === eventName)
  }

  getEventData(eventName: string): unknown | null {
    const event = this.events.find(e => e.name === eventName)
    return event ? event.data : null
  }

  setQueryResult(key: string, result: unknown): void {
    this.queryResults.set(key, result)
  }

  async executeQuery(key: string): Promise<unknown> {
    const result = this.queryResults.get(key)
    if (!result) {
      throw new TestError(`No mock result found for query: ${key}`)
    }
    return result
  }

  async cleanupTestData(): Promise<void> {
    logger.info('🧹 Очистка тестовых данных')
    this.clearEvents()
    this.queryResults.clear()
  }
}

export const testEngine = new TestEngine()
