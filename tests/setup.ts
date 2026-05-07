/**
 * Vitest Global Setup
 * Sets up test environment and mocks
 */

import { vi, beforeEach, afterEach } from 'vitest'

// ============================================
// Polyfill for vi.mocked (not available in bun test)
// ============================================
if (typeof vi.mocked !== 'function') {
  ;(vi as unknown as { mocked: <T>(fn: T) => T }).mocked = <T>(fn: T): T => fn
}

// ============================================
// Environment Variables (Required for tests)
// ============================================
process.env.NODE_ENV = 'test'
process.env.FAL_KEY = 'test-fal-key'
process.env.FAL_DEFAULT_LORA_PATH = 'https://test.fal.media/test-lora.safetensors'
process.env.FAL_LORA_TRIGGER = 'NEURO_SAGE'
process.env.FAL_DEFAULT_LORA_SCALE = '1.0'
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.REPLICATE_API_KEY = 'test-replicate-key'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key'
process.env.HEYGEN_API_KEY = 'test-heygen-key'
process.env.HEDRA_API_KEY = 'test-hedra-key'

// ============================================
// Global Mocks
// ============================================

// Mock logger to prevent console spam during tests
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// ============================================
// Global Hooks
// ============================================

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Use real timers after each test (fixes vi.clearAllTimers issue)
  vi.useRealTimers()
})

// ============================================
// Mock Context Factory (for Telegram tests)
// ============================================
export function createMockContext(overrides = {}) {
  return {
    from: { id: 123456789, username: 'testuser' },
    chat: { id: 123456789 },
    message: { text: 'test' },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    replyWithHTML: vi.fn().mockResolvedValue({ message_id: 1 }),
    answerCbQuery: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      sendPhoto: vi.fn().mockResolvedValue({ message_id: 1 }),
      sendVideo: vi.fn().mockResolvedValue({ message_id: 1 }),
      editMessageText: vi.fn().mockResolvedValue(true),
    },
    scene: {
      enter: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      reenter: vi.fn().mockResolvedValue(undefined),
    },
    wizard: {
      next: vi.fn().mockResolvedValue(undefined),
      back: vi.fn().mockResolvedValue(undefined),
      selectStep: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      wizardData: {},
      language: 'ru',
    },
    botInfo: { username: 'test_bot' },
    ...overrides,
  }
}

// ============================================
// Mock Supabase Factory
// ============================================
export function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    from: vi.fn(() => mockChain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      signIn: vi.fn().mockResolvedValue({ data: null, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}
