import { vi } from 'vitest'

// Mock logger globally
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

console.log('--- Global Logger Mock Initialized ---')
