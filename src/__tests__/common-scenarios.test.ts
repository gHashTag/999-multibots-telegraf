import { vi } from 'vitest'

// Mock Supabase client to avoid real initialization
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        update: vi.fn(() => Promise.resolve({ data: [], error: null })),
        insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { user: null, session: null }, error: null })
        ),
      },
    })),
  }
})

// Мокирование Supabase клиента
vi.mock('../core/supabase/client', () => ({
  supabaseClient: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: { path: 'mocked/path' }, error: null }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: 'mocked/url' }, error: null }),
      }),
    },
  },
}))

// ... existing code ...

describe('Common Scenarios', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true)
  })
})
