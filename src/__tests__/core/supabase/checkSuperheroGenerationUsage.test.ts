import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkSuperheroGenerationUsage } from '@/core/supabase/checkSuperheroGenerationUsage'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { supabase } from '@/core/supabase/client'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Разбор ЖИВОЙ базы через Infisical: без креденшелов файл падает с
// «Infisical credentials missing». Запускаем только при их наличии.
const HAS_INFISICAL = Boolean(
  process.env.INFISICAL_CLIENT_ID &&
    process.env.INFISICAL_CLIENT_SECRET &&
    process.env.INFISICAL_PROJECT_ID
)

// Mock dependencies
vi.mock('@/core/supabase/client')
vi.mock('@/core/supabase/getUserDetailsSubscription')
vi.mock('@/utils/logger')
vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456789],
}))

const mockSupabase = supabase as any
const mockGetUserDetailsSubscription = getUserDetailsSubscription as any

describe.skipIf(!HAS_INFISICAL)('checkSuperheroGenerationUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Admin users', () => {
    it('should allow unlimited generations for admin users', async () => {
      const result = await checkSuperheroGenerationUsage(123456789)

      expect(result).toEqual({
        canGenerate: true,
        remainingGenerations: -1,
        totalGenerations: 0,
        maxGenerations: null,
        isAdmin: true,
        hasSubscription: false,
        subscriptionType: null,
        resetDate: null,
      })
    })
  })

  describe('NEUROTESTER subscribers', () => {
    it('should allow unlimited generations for NEUROTESTER subscribers', async () => {
      mockGetUserDetailsSubscription.mockResolvedValue({
        id: 1,
        created_at: '2023-01-01',
        stars: 1000,
        subscriptionType: SubscriptionType.NEUROTESTER,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2023-01-01',
      })

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result).toEqual({
        canGenerate: true,
        remainingGenerations: -1,
        totalGenerations: 0,
        maxGenerations: null,
        isAdmin: false,
        hasSubscription: true,
        subscriptionType: SubscriptionType.NEUROTESTER,
        resetDate: null,
      })
    })
  })

  describe('Regular users', () => {
    beforeEach(() => {
      mockGetUserDetailsSubscription.mockResolvedValue({
        id: 1,
        created_at: '2023-01-01',
        stars: 100,
        subscriptionType: null,
        isSubscriptionActive: false,
        isExist: true,
        subscriptionStartDate: null,
      })
    })

    it('should allow generation when user has remaining generations', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { generation_count: 1 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any)

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result.canGenerate).toBe(true)
      expect(result.remainingGenerations).toBe(2)
      expect(result.totalGenerations).toBe(1)
      expect(result.maxGenerations).toBe(3)
      expect(result.isAdmin).toBe(false)
      expect(result.hasSubscription).toBe(false)
    })

    it('should deny generation when user has exceeded limit', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { generation_count: 3 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any)

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result.canGenerate).toBe(false)
      expect(result.remainingGenerations).toBe(0)
      expect(result.totalGenerations).toBe(3)
      expect(result.maxGenerations).toBe(3)
      expect(result.isAdmin).toBe(false)
      expect(result.hasSubscription).toBe(false)
    })

    it('should allow generation for new user (no existing record)', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116' },
                }),
              }),
            }),
          }),
        }),
      } as any)

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result.canGenerate).toBe(true)
      expect(result.remainingGenerations).toBe(3)
      expect(result.totalGenerations).toBe(0)
      expect(result.maxGenerations).toBe(3)
    })
  })

  describe('Other subscription types', () => {
    it('should apply regular limits for NEUROPHOTO subscribers', async () => {
      mockGetUserDetailsSubscription.mockResolvedValue({
        id: 1,
        created_at: '2023-01-01',
        stars: 1000,
        subscriptionType: SubscriptionType.NEUROPHOTO,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2023-01-01',
      })

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { generation_count: 2 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any)

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result.canGenerate).toBe(true)
      expect(result.remainingGenerations).toBe(1)
      expect(result.hasSubscription).toBe(true)
      expect(result.subscriptionType).toBe(SubscriptionType.NEUROPHOTO)
    })
  })

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetUserDetailsSubscription.mockRejectedValue(
        new Error('Database connection failed')
      )

      const result = await checkSuperheroGenerationUsage('987654321')

      expect(result.canGenerate).toBe(true) // Safe default
      expect(result.remainingGenerations).toBe(3)
      expect(result.totalGenerations).toBe(0)
      expect(result.maxGenerations).toBe(3)
    })
  })
})
