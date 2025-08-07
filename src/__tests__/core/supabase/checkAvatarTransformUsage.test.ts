import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'

// Mock dependencies
const mockCreateUser = mock(async () => [true, { id: 1, telegram_id: '12345' }])
const mockLogger = {
  info: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
}

const mockSupabaseQuery = {
  select: mock(() => mockSupabaseQuery),
  eq: mock(() => mockSupabaseQuery),
  single: mock(() => Promise.resolve({ data: null, error: null })),
}

const mockSupabase = {
  from: mock(() => mockSupabaseQuery),
}

// Mock modules
mock.module('@/core/supabase/createUser', () => ({
  createUser: mockCreateUser,
}))

mock.module('@/utils/logger', () => ({
  logger: mockLogger,
}))

mock.module('@/core/supabase/client', () => ({
  supabase: mockSupabase,
}))

mock.module('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456789],
}))

describe('checkAvatarTransformUsage', () => {
  beforeEach(() => {
    // Reset mock call counts
    mockLogger.info.mockClear?.()
    mockLogger.error.mockClear?.()
    mockCreateUser.mockClear?.()
    mockSupabaseQuery.single.mockClear?.()
  })

  it('should allow admin users unlimited access', async () => {
    const adminId = '123456789'

    const result = await checkAvatarTransformUsage(adminId)

    expect(result).toEqual({
      canUse: true,
      isAdmin: true,
      hasUsedBefore: false,
    })
  })

  it('should check existing user usage and allow if not used before', async () => {
    const telegramId = '987654321'

    // Setup mock to return user data with avatar_transform_used: false
    mockSupabaseQuery.single.mockImplementationOnce(() =>
      Promise.resolve({
        data: { avatar_transform_used: false },
        error: null,
      })
    )

    const result = await checkAvatarTransformUsage(telegramId)

    expect(result).toEqual({
      canUse: true,
      isAdmin: false,
      hasUsedBefore: false,
    })
  })

  it('should prevent usage if user has already used the feature', async () => {
    const telegramId = '987654321'

    // Setup mock to return user data with avatar_transform_used: true
    mockSupabaseQuery.single.mockImplementationOnce(() =>
      Promise.resolve({
        data: { avatar_transform_used: true },
        error: null,
      })
    )

    const result = await checkAvatarTransformUsage(telegramId)

    expect(result).toEqual({
      canUse: false,
      isAdmin: false,
      hasUsedBefore: true,
    })
  })

  it('should create user when user not found and allow usage', async () => {
    const telegramId = '555555555'

    // Mock user not found error
    mockSupabaseQuery.single.mockImplementationOnce(() =>
      Promise.resolve({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      })
    )

    // Mock successful user creation
    mockCreateUser.mockImplementationOnce(() =>
      Promise.resolve([true, { id: 1, telegram_id: telegramId }])
    )

    const result = await checkAvatarTransformUsage(telegramId)

    expect(result).toEqual({
      canUse: true,
      isAdmin: false,
      hasUsedBefore: false,
    })
  })

  it('should handle database errors gracefully', async () => {
    const telegramId = '777777777'

    // Mock database connection error
    mockSupabaseQuery.single.mockImplementationOnce(() =>
      Promise.resolve({
        data: null,
        error: {
          code: 'CONNECTION_ERROR',
          message: 'Database connection failed',
        },
      })
    )

    const result = await checkAvatarTransformUsage(telegramId)

    expect(result).toEqual({
      canUse: true, // Safe default
      isAdmin: false,
      hasUsedBefore: false,
    })
  })
})
