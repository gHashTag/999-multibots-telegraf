/**
 * Mock Supabase client for testing
 */

import { vi } from 'vitest'

// Mock Supabase client methods
const mockSupabaseClient = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null
            })
          })
        }),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null
        }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      }),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null
      })
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      })
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: null
      })
    })
  })
}

// Export the mock
export const supabase = mockSupabaseClient
export const supabaseAdmin = mockSupabaseClient

// Mock the entire module
vi.mock('@/core/supabase', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient
}))

vi.mock('@/core/supabase/client', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient
}))

vi.mock('@/core/supabase/index', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient
}))