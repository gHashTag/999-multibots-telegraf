import { InngestTestEngine, TestEvent, TestState } from './types'
import { TEST_CONFIG } from './test-config'
import { supabase } from '../core/supabase/client'

export class TestEngine implements InngestTestEngine {
  private state: TestState = {
    events: [],
    lastEventId: 0,
  }

  async clearEvents(): Promise<void> {
    this.state.events = []
    this.state.lastEventId = 0
  }

  async sendEvent(event: TestEvent): Promise<void> {
    const eventWithId = {
      ...event,
      id: ++this.state.lastEventId,
      timestamp: Date.now(),
    }
    this.state.events.push(eventWithId)
  }

  getEventsByName(name: string): TestEvent[] {
    return this.state.events.filter(event => event.name === name)
  }

  async waitForEvent(name: string, timeout: number): Promise<TestEvent | null> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const events = this.getEventsByName(name)
      if (events.length > 0) {
        return events[events.length - 1]
      }
      await new Promise(resolve =>
        setTimeout(resolve, TEST_CONFIG.POLL_INTERVAL)
      )
    }

    return null
  }

  async executeQuery(query: string): Promise<unknown> {
    try {
      const { data, error } = await supabase.rpc('execute_test_query', {
        query,
      })
      if (error) throw error
      return data
    } catch (error) {
      console.error('❌ Error executing query:', error)
      throw error
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.executeQuery('DELETE FROM test_data')
      await this.clearEvents()
    } catch (error) {
      console.error('❌ Error during cleanup:', error)
      throw error
    }
  }
}
