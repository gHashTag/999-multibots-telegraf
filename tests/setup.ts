/**
 * Test setup configuration
 */

import { beforeAll, vi } from 'vitest'

// Set test environment variables
process.env.SUPABASE_URL = 'https://test-project.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.NODE_ENV = 'test'
process.env.TEST_MODE = 'true'

// Mock all external modules before importing our code
beforeAll(() => {
  // Mock Supabase client creation
  vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: null,
                  error: null
                })),
                maybeSingle: vi.fn(() => Promise.resolve({
                  data: null,
                  error: null
                }))
              }))
            })),
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            })),
            maybeSingle: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            }))
          })),
          single: vi.fn(() => Promise.resolve({
            data: null,
            error: null
          }))
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            }))
          }))
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({
            data: null,
            error: null
          }))
        }))
      }))
    }))
  }))

  // Mock logger
  vi.mock('@/utils/logger', () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
  }))

  // Mock config
  vi.mock('@/config', () => ({
    isDev: true,
    ADMIN_IDS_ARRAY: [144022504, 1254048880],
    TELEGRAM_BOT_TOKEN: 'test-bot-token',
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key'
  }))
})