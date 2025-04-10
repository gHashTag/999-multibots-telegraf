// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.INNGEST_EVENT_KEY = 'test-key'

// Mock Supabase environment variables
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.SUPABASE_SERVICE_KEY = 'test-anon-key'

// Mock Telegram bot environment variables
process.env.BOT_TOKEN_1 = 'test-bot-token'
process.env.BOT_TOKEN_TEST_1 = 'test-bot-token'

// Add any other test setup here
jest.setTimeout(30000) // Set timeout to 30 seconds for all tests

// Mock Supabase client
jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}))

// Mock Telegram bot
jest.mock('@/core/bot', () => ({
  getBotByName: jest.fn(() => ({
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({}),
      sendPhoto: jest.fn().mockResolvedValue({}),
      sendVideo: jest.fn().mockResolvedValue({}),
    },
  })),
})) 