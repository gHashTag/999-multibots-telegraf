/**
 * Tests for getGenerationLimitMessage.ts
 *
 * Generation limit messages and badges for the superhero system
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock checkSuperheroGenerationUsage
vi.mock('@/core/supabase/checkSuperheroGenerationUsage', () => ({
  checkSuperheroGenerationUsage: vi.fn(),
}))

import {
  getGenerationStatusBadge,
  getGenerationLimitMessage,
  getSuccessGenerationMessage,
  getHeroesMenuTitle,
  getGenerationStatusBadgeAsync,
} from '@/helpers/getGenerationLimitMessage'
import { checkSuperheroGenerationUsage } from '@/core/supabase/checkSuperheroGenerationUsage'
import { logger } from '@/utils/logger'

describe('getGenerationLimitMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getGenerationStatusBadge', () => {
    describe('unlimited access', () => {
      it('should return infinity emoji for unlimited access', () => {
        const result = getGenerationStatusBadge(true, 0, 10)
        expect(result).toBe('♾️')
      })

      it('should return infinity emoji regardless of usage', () => {
        const result = getGenerationStatusBadge(true, 100, 10)
        expect(result).toBe('♾️')
      })
    })

    describe('limited access', () => {
      it('should return prohibition emoji when limit reached', () => {
        const result = getGenerationStatusBadge(false, 10, 10)
        expect(result).toBe('🚫')
      })

      it('should return prohibition emoji when limit exceeded', () => {
        const result = getGenerationStatusBadge(false, 15, 10)
        expect(result).toBe('🚫')
      })

      it('should return usage progress when under limit', () => {
        const result = getGenerationStatusBadge(false, 5, 10)
        expect(result).toBe('5/10')
      })

      it('should return 0/10 for no usage', () => {
        const result = getGenerationStatusBadge(false, 0, 10)
        expect(result).toBe('0/10')
      })
    })
  })

  describe('getGenerationLimitMessage', () => {
    describe('unlimited access', () => {
      it('should return admin message in Russian', () => {
        const result = getGenerationLimitMessage(
          true,
          true,
          0,
          10,
          undefined,
          true
        )
        expect(result).toContain('безлимитный доступ')
        expect(result).toContain('администратор')
      })

      it('should return admin message in English', () => {
        const result = getGenerationLimitMessage(
          false,
          true,
          0,
          10,
          undefined,
          true
        )
        expect(result).toContain('unlimited access')
        expect(result).toContain('administrator')
      })

      it('should return NEUROTESTER message in Russian', () => {
        const result = getGenerationLimitMessage(
          true,
          true,
          0,
          10,
          undefined,
          false,
          'NEUROTESTER'
        )
        expect(result).toContain('безлимитный доступ')
        expect(result).toContain('NEUROTESTER')
      })

      it('should return NEUROTESTER message in English', () => {
        const result = getGenerationLimitMessage(
          false,
          true,
          0,
          10,
          undefined,
          false,
          'NEUROTESTER'
        )
        expect(result).toContain('unlimited access')
        expect(result).toContain('NEUROTESTER')
      })

      it('should return generic unlimited message when not admin or NEUROTESTER', () => {
        const result = getGenerationLimitMessage(true, true, 0, 10)
        expect(result).toContain('♾️')
        expect(result).toContain('безлимитный доступ')
      })
    })

    describe('limit reached', () => {
      it('should return limit reached message in Russian', () => {
        const result = getGenerationLimitMessage(true, false, 10, 10)
        expect(result).toContain('🚫')
        expect(result).toContain('Достигнут месячный лимит')
        expect(result).toContain('10/10')
      })

      it('should return limit reached message in English', () => {
        const result = getGenerationLimitMessage(false, false, 10, 10)
        expect(result).toContain('🚫')
        expect(result).toContain('Monthly generation limit reached')
        expect(result).toContain('10/10')
      })

      it('should include reset date info in Russian', () => {
        const result = getGenerationLimitMessage(
          true,
          false,
          10,
          10,
          '2024-02-01'
        )
        expect(result).toContain('Лимит обновится')
      })

      it('should include reset date info in English', () => {
        const result = getGenerationLimitMessage(
          false,
          false,
          10,
          10,
          '2024-02-01'
        )
        expect(result).toContain('Limit resets')
      })

      it('should suggest NEUROTESTER subscription', () => {
        const result = getGenerationLimitMessage(true, false, 10, 10)
        expect(result).toContain('NEUROTESTER')
      })
    })

    describe('under limit', () => {
      it('should show remaining generations in Russian', () => {
        const result = getGenerationLimitMessage(true, false, 3, 10)
        expect(result).toContain('✨')
        expect(result).toContain('Доступно генераций: 7 из 10')
      })

      it('should show remaining generations in English', () => {
        const result = getGenerationLimitMessage(false, false, 3, 10)
        expect(result).toContain('✨')
        expect(result).toContain('Generations available: 7 of 10')
      })

      it('should show monthly reset info', () => {
        const result = getGenerationLimitMessage(true, false, 3, 10)
        expect(result).toContain('обновляется каждый месяц')
      })
    })
  })

  describe('getSuccessGenerationMessage', () => {
    describe('unlimited access', () => {
      it('should return success message in Russian', () => {
        const result = getSuccessGenerationMessage(true, true, 5, 10)
        expect(result).toContain('✅')
        expect(result).toContain('безлимитный доступ')
      })

      it('should return success message in English', () => {
        const result = getSuccessGenerationMessage(false, true, 5, 10)
        expect(result).toContain('✅')
        expect(result).toContain('unlimited access')
      })
    })

    describe('limited access with remaining', () => {
      it('should show remaining count in Russian', () => {
        const result = getSuccessGenerationMessage(true, false, 3, 10)
        expect(result).toContain('✅')
        expect(result).toContain('Осталось генераций: 7')
      })

      it('should show remaining count in English', () => {
        const result = getSuccessGenerationMessage(false, false, 3, 10)
        expect(result).toContain('✅')
        expect(result).toContain('Generations remaining: 7')
      })
    })

    describe('last generation used', () => {
      it('should show last generation message in Russian', () => {
        const result = getSuccessGenerationMessage(true, false, 10, 10)
        expect(result).toContain('✅')
        expect(result).toContain('последняя бесплатная генерация')
        expect(result).toContain('NEUROTESTER')
      })

      it('should show last generation message in English', () => {
        const result = getSuccessGenerationMessage(false, false, 10, 10)
        expect(result).toContain('✅')
        expect(result).toContain('last free generation')
        expect(result).toContain('NEUROTESTER')
      })
    })
  })

  describe('getHeroesMenuTitle', () => {
    it('should return Russian title with infinity badge', () => {
      const result = getHeroesMenuTitle(true, '♾️')
      expect(result).toBe('🦸‍♂️ ИИ Герои ♾️')
    })

    it('should return English title with infinity badge', () => {
      const result = getHeroesMenuTitle(false, '♾️')
      expect(result).toBe('🦸‍♂️ AI Heroes ♾️')
    })

    it('should return title with prohibition badge', () => {
      const result = getHeroesMenuTitle(true, '🚫')
      expect(result).toBe('🦸‍♂️ ИИ Герои 🚫')
    })

    it('should return title with usage badge', () => {
      const result = getHeroesMenuTitle(false, '5/10')
      expect(result).toBe('🦸‍♂️ AI Heroes 5/10')
    })
  })

  describe('getGenerationStatusBadgeAsync', () => {
    it('should return badge from database check', async () => {
      ;(checkSuperheroGenerationUsage as Mock).mockResolvedValue({
        hasUnlimitedAccess: false,
        currentUsage: 5,
        maxUsage: 10,
      })

      const result = await getGenerationStatusBadgeAsync('123456', true)

      expect(result).toBe('5/10')
      expect(checkSuperheroGenerationUsage).toHaveBeenCalledWith('123456')
    })

    it('should return infinity badge for unlimited access', async () => {
      ;(checkSuperheroGenerationUsage as Mock).mockResolvedValue({
        hasUnlimitedAccess: true,
        currentUsage: 100,
        maxUsage: 10,
      })

      const result = await getGenerationStatusBadgeAsync('123456', true)

      expect(result).toBe('♾️')
    })

    it('should return fallback emoji on error', async () => {
      ;(checkSuperheroGenerationUsage as Mock).mockRejectedValue(
        new Error('Database error')
      )

      const result = await getGenerationStatusBadgeAsync('123456', true)

      expect(result).toBe('🎮')
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get generation status'),
        expect.any(Object)
      )
    })

    it('should accept number telegram id', async () => {
      ;(checkSuperheroGenerationUsage as Mock).mockResolvedValue({
        hasUnlimitedAccess: false,
        currentUsage: 0,
        maxUsage: 10,
      })

      await getGenerationStatusBadgeAsync(123456, false)

      expect(checkSuperheroGenerationUsage).toHaveBeenCalledWith(123456)
    })
  })
})
