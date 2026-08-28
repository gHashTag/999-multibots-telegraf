/**
 * Tests for centralizedLanguage.ts
 *
 * Critical language detection and management functions
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
  updateUserLanguage: vi.fn(),
}))

import {
  getUserLanguageFromState,
  isRussianFromState,
  setUserLanguageInState,
  toggleUserLanguageInState,
} from '@/helpers/centralizedLanguage'
import { updateUserLanguage } from '@/core/supabase'
import { logger } from '@/utils/logger'

const createMockContext = (overrides: Partial<MyContext> = {}): MyContext =>
  ({
    from: { id: 123456789, language_code: 'en' },
    state: { userLanguage: undefined },
    ...overrides,
  }) as unknown as MyContext

describe('getUserLanguageFromState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when state has language', () => {
    it('should return Russian from state', () => {
      const ctx = createMockContext({
        state: { userLanguage: 'ru' },
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('ru')
    })

    it('should return English from state', () => {
      const ctx = createMockContext({
        state: { userLanguage: 'en' },
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('en')
    })

    it('should log language retrieval from state', () => {
      const ctx = createMockContext({
        state: { userLanguage: 'ru' },
      })

      getUserLanguageFromState(ctx)

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using STATE'),
        expect.any(Object)
      )
    })
  })

  describe('when state is empty (fallback)', () => {
    it('should fallback to Russian if telegram language_code is ru', () => {
      const ctx = createMockContext({
        from: { id: 123456789, language_code: 'ru' },
        state: {},
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('ru')
    })

    it('should fallback to English for any other language_code', () => {
      const ctx = createMockContext({
        from: { id: 123456789, language_code: 'de' },
        state: {},
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('en')
    })

    it('should fallback to English when language_code is undefined', () => {
      const ctx = createMockContext({
        from: { id: 123456789, language_code: undefined },
        state: {},
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('en')
    })

    it('should log warning about empty state', () => {
      const ctx = createMockContext({
        state: {},
      })

      getUserLanguageFromState(ctx)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('STATE EMPTY'),
        expect.any(Object)
      )
    })
  })

  describe('edge cases', () => {
    it('should handle missing state object', () => {
      const ctx = createMockContext({
        state: undefined as any,
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('en')
    })

    it('should handle missing from object', () => {
      const ctx = createMockContext({
        from: undefined as any,
        state: {},
      })

      const result = getUserLanguageFromState(ctx)

      expect(result).toBe('en')
    })
  })
})

describe('isRussianFromState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when language is Russian', () => {
    const ctx = createMockContext({
      state: { userLanguage: 'ru' },
    })

    const result = isRussianFromState(ctx)

    expect(result).toBe(true)
  })

  it('should return false when language is English', () => {
    const ctx = createMockContext({
      state: { userLanguage: 'en' },
    })

    const result = isRussianFromState(ctx)

    expect(result).toBe(false)
  })

  it('should log the Russian check', () => {
    const ctx = createMockContext({
      state: { userLanguage: 'ru' },
    })

    isRussianFromState(ctx)

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('RUSSIAN CHECK'),
      expect.objectContaining({ isRussian: true })
    )
  })
})

describe('setUserLanguageInState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful language set', () => {
    it('should update database and state', async () => {
      const ctx = createMockContext({
        from: { id: 123456789 },
        state: { userLanguage: 'en' },
      })
      ;(updateUserLanguage as Mock).mockResolvedValue(undefined)

      const result = await setUserLanguageInState(ctx, 'ru')

      expect(result).toBe(true)
      expect(updateUserLanguage).toHaveBeenCalledWith('123456789', 'ru')
      expect(ctx.state.userLanguage).toBe('ru')
    })

    it('should create state object if missing', async () => {
      const ctx = createMockContext({
        from: { id: 123456789 },
        state: undefined as any,
      })
      ;(updateUserLanguage as Mock).mockResolvedValue(undefined)

      await setUserLanguageInState(ctx, 'en')

      expect(ctx.state).toBeDefined()
      expect(ctx.state.userLanguage).toBe('en')
    })
  })

  describe('error handling', () => {
    it('should return false when telegram_id is missing', async () => {
      const ctx = createMockContext({
        from: undefined as any,
      })

      const result = await setUserLanguageInState(ctx, 'ru')

      expect(result).toBe(false)
      expect(updateUserLanguage).not.toHaveBeenCalled()
    })

    it('should return false when database update fails', async () => {
      const ctx = createMockContext({
        from: { id: 123456789 },
        state: {},
      })
      ;(updateUserLanguage as Mock).mockRejectedValue(new Error('DB error'))

      const result = await setUserLanguageInState(ctx, 'ru')

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalled()
    })
  })
})

describe('toggleUserLanguageInState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should toggle from Russian to English', async () => {
    const ctx = createMockContext({
      from: { id: 123456789 },
      state: { userLanguage: 'ru' },
    })
    ;(updateUserLanguage as Mock).mockResolvedValue(undefined)

    const result = await toggleUserLanguageInState(ctx)

    expect(result).toBe('en')
    expect(ctx.state.userLanguage).toBe('en')
  })

  it('should toggle from English to Russian', async () => {
    const ctx = createMockContext({
      from: { id: 123456789 },
      state: { userLanguage: 'en' },
    })
    ;(updateUserLanguage as Mock).mockResolvedValue(undefined)

    const result = await toggleUserLanguageInState(ctx)

    expect(result).toBe('ru')
    expect(ctx.state.userLanguage).toBe('ru')
  })

  it('should return current language if toggle fails', async () => {
    const ctx = createMockContext({
      from: { id: 123456789 },
      state: { userLanguage: 'ru' },
    })
    ;(updateUserLanguage as Mock).mockRejectedValue(new Error('DB error'))

    const result = await toggleUserLanguageInState(ctx)

    expect(result).toBe('ru')
  })

  it('should log toggle operation', async () => {
    const ctx = createMockContext({
      from: { id: 123456789 },
      state: { userLanguage: 'ru' },
    })
    ;(updateUserLanguage as Mock).mockResolvedValue(undefined)

    await toggleUserLanguageInState(ctx)

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('TOGGLING LANGUAGE'),
      expect.objectContaining({
        currentLanguage: 'ru',
        newLanguage: 'en',
      })
    )
  })
})
