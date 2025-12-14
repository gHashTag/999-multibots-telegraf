/**
 * Tests for featureViews.ts
 *
 * Feature views tracking - user's first-time feature help display
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    })),
  },
}))

import {
  hasUserSeenFeature,
  markFeatureAsSeen,
  getUserSeenFeatures,
  resetUserFeatureViews,
} from '@/core/supabase/featureViews'
import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'

// Helper to setup supabase mocks
const setupSupabaseMocks = (options: {
  selectData?: any
  selectError?: any
  upsertError?: any
  deleteError?: any
} = {}) => {
  const { selectData = null, selectError = null, upsertError = null, deleteError = null } = options

  const mockMaybeSingle = vi.fn().mockResolvedValue({
    data: selectData,
    error: selectError,
  })

  const mockEq = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: mockMaybeSingle,
    }),
    maybeSingle: mockMaybeSingle,
  })

  const mockSelect = vi.fn().mockReturnValue({
    eq: mockEq,
  })

  const mockUpsert = vi.fn().mockResolvedValue({
    error: upsertError,
  })

  const mockDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: deleteError,
    }),
  })

  ;(supabase.from as Mock).mockReturnValue({
    select: mockSelect,
    upsert: mockUpsert,
    delete: mockDelete,
    eq: mockEq,
  })

  return { mockSelect, mockEq, mockMaybeSingle, mockUpsert, mockDelete }
}

describe('hasUserSeenFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when record exists', async () => {
    setupSupabaseMocks({ selectData: { id: 1 } })

    const result = await hasUserSeenFeature('123456789', 'neuro_photo')

    expect(result).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('user_feature_views')
  })

  it('should return false when record does not exist', async () => {
    setupSupabaseMocks({ selectData: null })

    const result = await hasUserSeenFeature('123456789', 'neuro_photo')

    expect(result).toBe(false)
  })

  it('should return false on database error', async () => {
    setupSupabaseMocks({ selectError: { message: 'DB error' } })

    const result = await hasUserSeenFeature('123456789', 'neuro_photo')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error checking feature view'),
      expect.any(Object)
    )
  })

  it('should return false on exception', async () => {
    ;(supabase.from as Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const result = await hasUserSeenFeature('123456789', 'neuro_photo')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Exception checking feature view'),
      expect.any(Object)
    )
  })
})

describe('markFeatureAsSeen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true on successful upsert', async () => {
    setupSupabaseMocks({ upsertError: null })

    const result = await markFeatureAsSeen('123456789', 'neuro_photo')

    expect(result).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('user_feature_views')
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Feature marked as seen'),
      expect.any(Object)
    )
  })

  it('should return false on upsert error', async () => {
    setupSupabaseMocks({ upsertError: { message: 'Upsert failed' } })

    const result = await markFeatureAsSeen('123456789', 'neuro_photo')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error marking feature as seen'),
      expect.any(Object)
    )
  })

  it('should return false on exception', async () => {
    ;(supabase.from as Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const result = await markFeatureAsSeen('123456789', 'neuro_photo')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Exception marking feature as seen'),
      expect.any(Object)
    )
  })

  it('should handle duplicate entries via upsert', async () => {
    setupSupabaseMocks({ upsertError: null })

    // Call twice - should not fail
    const result1 = await markFeatureAsSeen('123456789', 'neuro_photo')
    const result2 = await markFeatureAsSeen('123456789', 'neuro_photo')

    expect(result1).toBe(true)
    expect(result2).toBe(true)
  })
})

describe('getUserSeenFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return list of feature modes', async () => {
    const mockData = [
      { feature_mode: 'neuro_photo' },
      { feature_mode: 'text_to_video' },
      { feature_mode: 'lip_sync' },
    ]

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: mockData,
        error: null,
      }),
    })

    ;(supabase.from as Mock).mockReturnValue({
      select: mockSelect,
    })

    const result = await getUserSeenFeatures('123456789')

    expect(result).toEqual(['neuro_photo', 'text_to_video', 'lip_sync'])
    expect(supabase.from).toHaveBeenCalledWith('user_feature_views')
  })

  it('should return empty array when no views exist', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })

    ;(supabase.from as Mock).mockReturnValue({
      select: mockSelect,
    })

    const result = await getUserSeenFeatures('123456789')

    expect(result).toEqual([])
  })

  it('should return empty array when data is null', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    })

    ;(supabase.from as Mock).mockReturnValue({
      select: mockSelect,
    })

    const result = await getUserSeenFeatures('123456789')

    expect(result).toEqual([])
  })

  it('should return empty array on database error', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      }),
    })

    ;(supabase.from as Mock).mockReturnValue({
      select: mockSelect,
    })

    const result = await getUserSeenFeatures('123456789')

    expect(result).toEqual([])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error getting seen features'),
      expect.any(Object)
    )
  })

  it('should return empty array on exception', async () => {
    ;(supabase.from as Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const result = await getUserSeenFeatures('123456789')

    expect(result).toEqual([])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Exception getting seen features'),
      expect.any(Object)
    )
  })
})

describe('resetUserFeatureViews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true on successful delete', async () => {
    setupSupabaseMocks({ deleteError: null })

    const result = await resetUserFeatureViews('123456789')

    expect(result).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('user_feature_views')
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Feature views reset'),
      expect.any(Object)
    )
  })

  it('should return false on delete error', async () => {
    setupSupabaseMocks({ deleteError: { message: 'Delete failed' } })

    const result = await resetUserFeatureViews('123456789')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error resetting feature views'),
      expect.any(Object)
    )
  })

  it('should return false on exception', async () => {
    ;(supabase.from as Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const result = await resetUserFeatureViews('123456789')

    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Exception resetting feature views'),
      expect.any(Object)
    )
  })
})

describe('featureViews module exports', () => {
  it('should export hasUserSeenFeature function', async () => {
    expect(typeof hasUserSeenFeature).toBe('function')
  })

  it('should export markFeatureAsSeen function', async () => {
    expect(typeof markFeatureAsSeen).toBe('function')
  })

  it('should export getUserSeenFeatures function', async () => {
    expect(typeof getUserSeenFeatures).toBe('function')
  })

  it('should export resetUserFeatureViews function', async () => {
    expect(typeof resetUserFeatureViews).toBe('function')
  })
})
