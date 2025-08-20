import { beforeEach, describe, expect, it, mock } from 'bun:test'

// Mock Supabase client для Bun Test
const mockSupabase = {
  from: mock(() => ({
    select: mock(() => ({
      data: [],
      error: null,
    })),
    insert: mock(() => ({
      data: [{ id: 'mocked-id' }],
      error: null,
    })),
  })),
}
