import { TestResult, TestEvent, TestState } from './types'
import { ModeEnum } from '../types/modes'
import { TransactionType } from '../types/payments'

interface AmountConfig {
  small: number
  medium: number
  large: number
  MIN_AMOUNT: number
  MAX_AMOUNT: number
}

interface StarConversionConfig {
  rate: number
  STAR_TO_MONEY_RATE: number
}

interface ServicesConfig {
  TEXT_TO_VIDEO: string
  TOP_UP_BALANCE: string
}

interface StatusesConfig {
  COMPLETED: string
  PENDING: string
  FAILED: string
}

interface PaymentMethodsConfig {
  SYSTEM: string
  CRYPTO: string
  CARD: string
}

interface TransactionTypesConfig {
  MONEY_INCOME: string
  MONEY_EXPENSE: string
}

interface TestUserConfig {
  initialBalance: number
  language: string
  botName: string
  TELEGRAM_ID: string
  BOT_NAME: string
}

interface NotificationsConfig {
  adminChannelId: string
  templates: {
    ru: {
      success: string
      failed: string
    }
    en: {
      success: string
      failed: string
    }
  }
  TIMEOUT: number
  RETRY_COUNT: number
}

interface TestConfig {
  amounts: AmountConfig
  starConversion: StarConversionConfig
  services: ServicesConfig
  statuses: StatusesConfig
  paymentMethods: PaymentMethodsConfig
  transactionTypes: TransactionTypesConfig
  testUser: TestUserConfig
  notifications: NotificationsConfig
}

// Test configuration constants
export const TEST_CONFIG: TestConfig = {
  TEST_USER_ID: '123456789',
  TEST_BOT_NAME: 'test_bot',
  TEST_TIMEOUT: 5000,
  TEST_AMOUNT: 100,
  TEST_DESCRIPTION: 'Test transaction',
  TEST_SERVICE_TYPE: 'test_service',
  TEST_PAYMENT_METHOD: 'test_method',
  TEST_OPERATION_ID: 'test_op_123',
  TEST_INV_ID: 'test_inv_123',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  LOG_LEVEL: 'debug',
  CLEANUP_TIMEOUT: 2000,
  TIMEOUT: 5000,
  POLL_INTERVAL: 100,
  MAX_RETRIES: 3,
  EVENT_TIMEOUT: 5000,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/test',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  amounts: {
    small: 100,
    medium: 500,
    large: 1000,
    MIN_AMOUNT: 10,
    MAX_AMOUNT: 10000,
  },
  starConversion: {
    rate: 100,
    STAR_TO_MONEY_RATE: 0.01,
  },
  services: {
    TEXT_TO_VIDEO: ModeEnum.TextToVideo,
    TOP_UP_BALANCE: ModeEnum.TopUpBalance,
  },
  statuses: {
    COMPLETED: 'COMPLETED',
    PENDING: 'PENDING',
    FAILED: 'FAILED',
  },
  paymentMethods: {
    SYSTEM: 'system',
    CRYPTO: 'crypto',
    CARD: 'card',
  },
  transactionTypes: {
    MONEY_INCOME: TransactionType.MONEY_INCOME,
    MONEY_EXPENSE: TransactionType.MONEY_EXPENSE,
  },
  testUser: {
    initialBalance: 1000,
    language: 'ru',
    botName: 'test_bot',
    TELEGRAM_ID: '123456789',
    BOT_NAME: 'test_bot',
  },
  notifications: {
    adminChannelId: '-1001234567890',
    templates: {
      ru: {
        success: 'Успешно',
        failed: 'Ошибка',
      },
      en: {
        success: 'Success',
        failed: 'Failed',
      },
    },
    TIMEOUT: 5000,
    RETRY_COUNT: 3,
  },
} as const

// Custom error class for test failures
export class TestError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'TestError'
  }
}

/**
 * Test engine for managing test events and state
 */
export class TestEngine {
  private events: TestEvent[] = []
  private testState: Map<string, TestState> = new Map()

  async clearEvents(): Promise<void> {
    this.events = []
    this.testState.clear()
    console.log('🧹 Cleared all test events and state')
  }

  async sendEvent(event: TestEvent): Promise<void> {
    event.timestamp = Date.now()
    this.events.push(event)
    console.log(`🚀 Sent event: ${event.name}`)
  }

  async getEventsByName(name: string): Promise<TestEvent[]> {
    return this.events.filter(e => e.name === name)
  }

  async executeQuery(query: string): Promise<unknown> {
    try {
      console.log(`🔍 Executing query: ${query}`)
      return Promise.resolve({ success: true })
    } catch (error) {
      console.error('❌ Query execution failed:', error)
      throw new TestError('Query execution failed', { error: String(error) })
    }
  }

  setState(key: string, state: TestState): void {
    this.testState.set(key, state)
  }

  getState(key: string): TestState | undefined {
    return this.testState.get(key)
  }

  clearState(key: string): void {
    this.testState.delete(key)
  }

  logTestEvent(message: string, emoji = '📝'): void {
    console.log(`${emoji} ${message}`)
  }

  validateTestResult(result: TestResult): boolean {
    if (!result.name || typeof result.success !== 'boolean') {
      console.error('❌ Invalid test result format')
      return false
    }
    return true
  }

  async waitForEvent(
    eventName: string,
    timeout: number = 5000
  ): Promise<TestEvent | null> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const events = await this.getEventsByName(eventName)
      if (events.length > 0) return events[0]
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return null
  }

  async cleanupTestData(): Promise<void> {
    try {
      await this.executeQuery(
        "DELETE FROM test_data WHERE created_at < NOW() - INTERVAL '1 day'"
      )
      console.log('🧹 Cleaned up test data')
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
      throw new TestError('Test data cleanup failed', { error: String(error) })
    }
  }
}

// Create and export test engine instance
export const testEngine = new TestEngine()
