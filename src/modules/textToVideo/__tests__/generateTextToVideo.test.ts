import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest'

// Mock the Supabase client
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}))

// Original file content below
// src/__tests__/services/generateTextToVideo.test.ts
// ... остальное содержимое файла ...
