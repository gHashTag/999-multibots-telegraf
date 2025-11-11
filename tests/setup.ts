/**
 * Vitest Global Setup
 * Sets up test environment and mocks
 */

import { vi } from 'vitest'

// Mock environment variables
process.env.FAL_KEY = 'test-fal-key'
process.env.FAL_DEFAULT_LORA_PATH = 'https://test.fal.media/test-lora.safetensors'
process.env.FAL_LORA_TRIGGER = 'NEURO_SAGE'
process.env.FAL_DEFAULT_LORA_SCALE = '1.0'

// Mock logger to prevent console spam during tests
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))
