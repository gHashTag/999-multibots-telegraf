export class TestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TestError'
  }
}

export interface TestEvent {
  name: string
  data: unknown
  timestamp?: Date
}

export class TestEngine {
  private events: TestEvent[] = []
  private queryResults: Record<string, unknown> = {}

  async clearEvents(): Promise<void> {
    this.events = []
    this.queryResults = {}
    console.log('🧹 Cleared test events and query results')
  }

  async sendEvent(event: TestEvent): Promise<void> {
    this.events.push(event)
    console.log(`📤 Sent test event: ${event.name}`)
  }

  async getEvents(): Promise<TestEvent[]> {
    return this.events
  }

  async executeQuery(query: string): Promise<unknown> {
    const result = this.queryResults[query]
    console.log(`📥 Executed test query: ${query}`)
    return result
  }

  setQueryResult(query: string, result: unknown): void {
    this.queryResults[query] = result
    console.log(`💾 Set test query result for: ${query}`)
  }

  async cleanup(): Promise<void> {
    await this.clearEvents()
    console.log('🧹 Cleaned up test data')
  }
}

export interface TestConfig {
  testUser: {
    telegram_id: string
  }
  amount: number
  description: string
  botName: string
  testEngine: TestEngine
}

export const TEST_CONFIG: TestConfig = {
  testUser: {
    telegram_id: '123456789',
  },
  amount: 100,
  description: 'Test payment',
  botName: 'test_bot',
  testEngine: new TestEngine(),
}
