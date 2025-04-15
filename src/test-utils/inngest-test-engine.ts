import { TestEvent } from './types'
import { TEST_CONFIG } from './test-config'

export class InngestTestEngine {
  private events: TestEvent[] = []

  async clearEvents(): Promise<void> {
    this.events = []
  }

  async sendEvent(event: TestEvent): Promise<void> {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    })
  }

  getEventsByName(name: string): TestEvent[] {
    return this.events.filter(e => e.name === name)
  }

  async waitForEvent(
    name: string,
    timeout = TEST_CONFIG.TEST_TIMEOUT
  ): Promise<TestEvent | null> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const events = this.getEventsByName(name)
      if (events.length > 0) {
        return events[0]
      }
      await new Promise(resolve =>
        setTimeout(resolve, TEST_CONFIG.POLL_INTERVAL)
      )
    }
    return null
  }

  async executeQuery(query: string): Promise<unknown> {
    console.log('Executing query:', query)
    return Promise.resolve({ success: true })
  }

  async cleanup(): Promise<void> {
    await this.clearEvents()
  }
}

export const inngestTestEngine = new InngestTestEngine()
