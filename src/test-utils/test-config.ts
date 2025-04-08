import { Inngest } from 'inngest'
import { TestConfig } from './types'
import { LogData, logger } from '../utils/logger'

export const TEST_BOT_NAME = 'test_bot'
export const TEST_USER_ID = '123456789'
export const TEST_TELEGRAM_ID = '123456789'
export const TEST_IMAGE_URL = 'https://example.com/test.jpg'

// Custom logger for tests that includes emojis
const testLogger = {
  info: (data: LogData) => {
    logger.info({
      message: data.message || 'Test log',
      context: `TEST: ${data.context}`,
      ...data,
    })
  },
  error: (data: LogData) => {
    logger.error({
      message: data.message || 'Test error',
      context: `TEST: ${data.context}`,
      ...data,
    })
  },
  warn: (data: LogData) => {
    logger.warn({
      message: data.message || 'Test warning',
      context: `TEST: ${data.context}`,
      ...data,
    })
  },
  debug: (data: LogData) => {
    logger.debug({
      message: data.message || 'Test debug',
      context: `TEST: ${data.context}`,
      ...data,
    })
  },
}

export const TEST_CONFIG: TestConfig = {
  mockBot: {
    telegram: {},
  },
  mocks: {
    bot: {} as any,
  },
  server: {
    apiUrl: 'http://localhost:3000',
    webhookPath: '/webhook',
    bflWebhookPath: '/bfl-webhook',
    neurophotoWebhookPath: '/neurophoto-webhook',
  },
  users: {
    main: {
      id: 123456789,
      telegram_id: '123456789',
      username: 'test_user',
      first_name: 'Test',
      last_name: 'User',
      language_code: 'en',
      isRussian: false,
    },
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_KEY || '',
  },
  bots: {
    test_bot: {
      name: 'test_bot',
      token: 'test_token',
    },
    neurophoto: {
      name: 'neurophoto',
      token: 'neurophoto_token',
    },
    default: {
      name: 'default',
      token: 'default_token',
    },
  },
  TEST_USER_ID: '123456789',
  TEST_BOT_NAME: 'test_bot',
  TEST_TELEGRAM_ID: '123456789',
  TEST_IMAGE_URL: 'https://example.com/test.jpg',
  PAYMENT_PROCESSING_TIMEOUT: 30000,
  inngestEngine: new Inngest({ id: 'test-engine' }),
  models: {
    default: 'default',
    stable: 'stable',
    neurophoto: {
      name: 'neurophoto-model',
    },
  },
  cleanupAfterEach: true,
  modelTraining: [],
  CHECK_INTERVAL: 1000,
  TIMEOUT: 5000,
  endpoints: {
    payment: '/api/payment',
    generate: '/api/generate',
    check: '/api/check',
  },
  TEST_VOICE_ID: 'test_voice_id',
  VOICE_GENERATION_COST: 100,
  CLEANUP_TEST_DATA: true,
  timeouts: {
    default: 5000,
    long: 15000,
    short: 2000,
  },
  retries: {
    default: 3,
    max: 5,
  },
  delays: {
    default: 1000,
    long: 3000,
    short: 500,
  },
  env: {
    isTest: true,
    testMode: 'integration',
  },
  MAX_RETRIES: 3,
}

// Initialize test Inngest client
export const inngestTestEngine = new Inngest({
  id: 'test-engine',
  logger: testLogger,
})

export default TEST_CONFIG
