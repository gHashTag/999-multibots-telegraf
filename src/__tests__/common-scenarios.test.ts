import { vi } from 'vitest'

// Mock Supabase client
vi.mock('@/core/supabase/client.ts', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          data: [],
          error: null,
        }),
        insert: vi.fn().mockReturnValue({
          data: [{ id: 'mocked-id' }],
          error: null,
        }),
      }),
    },
  }
})
