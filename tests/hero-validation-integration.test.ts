/**
 * 🦸‍♂️ HERO VALIDATION SERVICE - INTEGRATION TESTS
 *
 * Comprehensive testing for hero validation in multi-image Neurophoto context
 * Validates hero system integration with enhanced image processing
 */

import { describe, test, expect, beforeEach, vi, Mock } from 'vitest'
import { HeroValidationService } from '@/services/HeroValidationService'
import {
  validateHero,
  HEROES_REGISTRY,
  getCriticalMissingHeroes,
  getHeroSystemStats,
  HeroName,
  Gender,
  HeroValidationResult
} from '@/types/heroes'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

describe('🦸‍♂️ Hero Validation Service - Multi-Image Integration', () => {
  let mockContext: Partial<MyContext>
  let consoleSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }

    // Mock context with multi-image session data
    mockContext = {
      from: { id: 12345 },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
      scene: {
        leave: vi.fn(),
        enter: vi.fn()
      },
      session: {
        mode: ModeEnum.AvatarTransform,
        selectedHero: undefined,
        selectedGender: 'male' as Gender,
        imageUrls: [], // Multi-image support
        kontextImageUrl: undefined
      }
    }
  })

  describe('🔍 Hero Validation with Multi-Image Context', () => {
    test('should validate critical heroes for multi-image processing', async () => {
      const criticalHeroes: HeroName[] = [
        'Человек-паук',
        'Железный человек',
        'Бэтмен',
        'Супермен',
        'Чудо-женщина',
        'Халк'
      ]

      const validationResults = await Promise.all(
        criticalHeroes.map(hero =>
          HeroValidationService.validateHeroWithLogging(
            hero,
            '12345',
            'multi_image_processing'
          )
        )
      )

      // All critical heroes should be valid
      validationResults.forEach((result, index) => {
        expect(result.isValid).toBe(true)
        expect(result.hero).toBe(criticalHeroes[index])
        expect(result.error).toBeNull()
      })

      // Verify logging
      expect(consoleSpy.log).toHaveBeenCalledTimes(criticalHeroes.length)
    })

    test('should handle invalid heroes gracefully in multi-image workflow', async () => {
      const invalidHero = 'НесуществующийГерой'

      const result = await HeroValidationService.validateHeroWithLogging(
        invalidHero,
        '12345',
        'multi_image_invalid_hero'
      )

      expect(result.isValid).toBe(false)
      expect(result.hero).toBeNull()
      expect(result.error).toBe('HERO_NOT_FOUND')

      // Verify error logging
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '🚨 [HERO VALIDATION ERROR] Hero validation failed',
        expect.objectContaining({
          heroName: invalidHero,
          error: 'HERO_NOT_FOUND',
          userId: '12345',
          context: 'multi_image_invalid_hero'
        })
      )
    })

    test('should provide fallback prompts for heroes without prompts', async () => {
      // Mock a hero without prompt for testing
      const testHero = 'Тестовый Герой' as HeroName

      // Temporarily add to registry without prompt
      const originalRegistry = { ...HEROES_REGISTRY }
      Object.assign(HEROES_REGISTRY, {
        [testHero]: {
          name: testHero,
          gender: 'male' as Gender,
          hasPrompt: false,
          category: 'popular' as const,
          priority: 999
        }
      })

      const result = validateHero(testHero)

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('PROMPT_MISSING')
      expect(result.fallbackPrompt).toContain('Cinematic portrait')
      expect(result.fallbackPrompt).toContain(testHero)

      // Restore original registry
      Object.assign(HEROES_REGISTRY, originalRegistry)
      delete (HEROES_REGISTRY as any)[testHero]
    })
  })

  describe('🔄 Safe Hero Selection for Multi-Image', () => {
    test('should successfully select valid hero for multi-image processing', async () => {
      const validHero = 'Человек-паук'
      const gender: Gender = 'male'

      mockContext.session!.imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg'
      ]

      const result = await HeroValidationService.safeHeroSelection(
        mockContext as MyContext,
        validHero,
        gender
      )

      expect(result.success).toBe(true)
      expect(result.shouldRedirect).toBeUndefined()
      expect(result.prompt).toBeUndefined() // Valid heroes don't need fallback prompts
    })

    test('should handle hero selection failure with multi-image context', async () => {
      const invalidHero = 'InvalidHero'
      const gender: Gender = 'female'

      mockContext.session!.imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg'
      ]

      const result = await HeroValidationService.safeHeroSelection(
        mockContext as MyContext,
        invalidHero,
        gender
      )

      expect(result.success).toBe(false)
      expect(result.shouldRedirect).toBe(true)

      // Verify user was informed about the error
      expect(mockContext.reply).toHaveBeenCalledWith(
        expect.stringContaining('🚫 Ошибка: Герой "InvalidHero" не найден в системе')
      )
    })

    test('should redirect to main menu after validation failure', async () => {
      const invalidHero = 'TestInvalidHero'

      await HeroValidationService.safeHeroSelection(
        mockContext as MyContext,
        invalidHero,
        'male'
      )

      // Verify scene transition
      expect(mockContext.scene!.leave).toHaveBeenCalled()

      // Check that redirect is scheduled
      setTimeout(() => {
        expect(mockContext.scene!.enter).toHaveBeenCalledWith('menu_scene')
      }, 1100) // After the 1000ms timeout
    })
  })

  describe('📊 System Diagnostics in Multi-Image Context', () => {
    test('should provide accurate system health metrics', async () => {
      const diagnostics = await HeroValidationService.runSystemDiagnostics()

      expect(diagnostics.systemHealth).toMatch(/^(healthy|warning|critical)$/)
      expect(diagnostics.stats).toBeDefined()
      expect(diagnostics.stats.totalHeroes).toBeGreaterThan(20) // We have many heroes
      expect(diagnostics.stats.coveragePercentage).toBeGreaterThan(90) // Most have prompts
      expect(diagnostics.criticalMissingHeroes).toHaveLength(0) // All critical heroes have prompts
      expect(Array.isArray(diagnostics.recommendations)).toBe(true)
    })

    test('should detect system health issues', async () => {
      // Mock error statistics to simulate unhealthy system
      const errorStats = {
        totalErrors: 150,
        errorsByType: {
          'HERO_NOT_FOUND': 50,
          'PROMPT_MISSING': 80,
          'INVALID_GENDER': 15,
          'SYSTEM_ERROR': 5
        } as const,
        errorsByHero: {},
        recentErrors: []
      }

      vi.spyOn(HeroValidationService, 'getErrorStats').mockReturnValue(errorStats)

      const diagnostics = await HeroValidationService.runSystemDiagnostics()

      expect(diagnostics.systemHealth).toBe('warning')
      expect(diagnostics.recommendations).toContain(
        expect.stringContaining('ВНИМАНИЕ: Много ошибок валидации героев')
      )
    })

    test('should track validation metrics for analytics', async () => {
      const mockSendMetrics = vi.spyOn(HeroValidationService, 'sendValidationMetrics')
        .mockImplementation(async () => {})

      await HeroValidationService.validateHeroWithLogging(
        'InvalidTestHero',
        '54321',
        'analytics_test'
      )

      expect(mockSendMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          heroName: 'InvalidTestHero',
          error: 'HERO_NOT_FOUND',
          userId: '54321',
          context: 'analytics_test',
          timestamp: expect.any(Date)
        })
      )
    })
  })

  describe('🛡️ Error Handling Integration', () => {
    test('should handle different error types with appropriate messages', async () => {
      const errorScenarios = [
        {
          hero: 'NonexistentHero',
          expectedError: 'HERO_NOT_FOUND',
          expectedMessage: '🚫 Ошибка: Герой "NonexistentHero" не найден в системе'
        }
      ]

      for (const scenario of errorScenarios) {
        const validation: HeroValidationResult = {
          isValid: false,
          hero: null,
          error: scenario.expectedError as any
        }

        await HeroValidationService.handleHeroValidationError(
          mockContext as MyContext,
          validation,
          scenario.hero
        )

        expect(mockContext.reply).toHaveBeenCalledWith(
          expect.stringContaining(scenario.expectedMessage)
        )
      }
    })

    test('should clear session state during error handling', async () => {
      mockContext.session!.selectedHero = 'SomeHero' as HeroName
      mockContext.session!.selectedGender = 'female'
      mockContext.session!.imageUrls = ['test1.jpg', 'test2.jpg']

      const validation: HeroValidationResult = {
        isValid: false,
        hero: null,
        error: 'SYSTEM_ERROR'
      }

      await HeroValidationService.handleHeroValidationError(
        mockContext as MyContext,
        validation,
        'TestHero'
      )

      // Session should be cleaned
      expect(mockContext.session!.mode).toBe(ModeEnum.MainMenu)
      expect(mockContext.session!.selectedHero).toBeUndefined()
      expect(mockContext.session!.selectedGender).toBeUndefined()
    })
  })

  describe('⚡ Performance & Optimization', () => {
    test('should handle multiple concurrent hero validations', async () => {
      const heroes: HeroName[] = [
        'Человек-паук',
        'Железный человек',
        'Бэтмен',
        'Супермен',
        'Капитан Америка'
      ]

      const startTime = performance.now()

      const results = await Promise.all(
        heroes.map(hero =>
          HeroValidationService.validateHeroWithLogging(
            hero,
            '12345',
            'concurrent_test'
          )
        )
      )

      const endTime = performance.now()
      const totalTime = endTime - startTime

      expect(results).toHaveLength(heroes.length)
      expect(results.every(r => r.isValid)).toBe(true)
      expect(totalTime).toBeLessThan(1000) // Should complete quickly
    })

    test('should maintain performance under high validation load', async () => {
      const validationTasks = Array.from({ length: 100 }, (_, i) =>
        HeroValidationService.validateHeroWithLogging(
          'Человек-паук',
          `user_${i}`,
          'load_test'
        )
      )

      const startTime = performance.now()
      const results = await Promise.all(validationTasks)
      const endTime = performance.now()

      expect(results).toHaveLength(100)
      expect(results.every(r => r.isValid)).toBe(true)
      expect(endTime - startTime).toBeLessThan(5000) // Should handle load efficiently
    })
  })

  describe('🔍 Edge Cases & Boundary Conditions', () => {
    test('should handle empty string hero names', async () => {
      const result = await HeroValidationService.validateHeroWithLogging(
        '',
        '12345',
        'empty_hero_test'
      )

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('HERO_NOT_FOUND')
    })

    test('should handle special characters in hero names', async () => {
      const specialHero = 'Человек-паук' // Contains hyphen

      const result = await HeroValidationService.validateHeroWithLogging(
        specialHero,
        '12345',
        'special_char_test'
      )

      expect(result.isValid).toBe(true)
      expect(result.hero).toBe(specialHero)
    })

    test('should handle undefined/null contexts gracefully', async () => {
      const mockEmptyContext = {
        from: undefined,
        reply: vi.fn(),
        scene: { leave: vi.fn(), enter: vi.fn() },
        session: {}
      } as any

      await expect(
        HeroValidationService.safeHeroSelection(
          mockEmptyContext,
          'Человек-паук',
          'male'
        )
      ).resolves.not.toThrow()
    })
  })

  describe('📈 Analytics & Monitoring', () => {
    test('should accumulate error statistics correctly', async () => {
      // Generate some validation errors
      await HeroValidationService.validateHeroWithLogging('Invalid1', '1', 'test')
      await HeroValidationService.validateHeroWithLogging('Invalid2', '2', 'test')
      await HeroValidationService.validateHeroWithLogging('Valid', '3', 'test')

      const stats = HeroValidationService.getErrorStats()

      expect(stats.totalErrors).toBeGreaterThanOrEqual(2) // At least 2 errors
      expect(stats.errorsByType['HERO_NOT_FOUND']).toBeGreaterThanOrEqual(2)
      expect(stats.recentErrors).toHaveLength(Math.min(10, stats.totalErrors))
    })

    test('should provide detailed error breakdowns', async () => {
      const stats = HeroValidationService.getErrorStats()

      expect(stats).toHaveProperty('totalErrors')
      expect(stats).toHaveProperty('errorsByType')
      expect(stats).toHaveProperty('errorsByHero')
      expect(stats).toHaveProperty('recentErrors')

      expect(typeof stats.totalErrors).toBe('number')
      expect(typeof stats.errorsByType).toBe('object')
      expect(Array.isArray(stats.recentErrors)).toBe(true)
    })
  })
})

// Integration test for the overall heroes system
describe('🦸‍♂️ Heroes System Integration', () => {
  test('should have complete hero registry with all required properties', () => {
    const stats = getHeroSystemStats()

    expect(stats.totalHeroes).toBeGreaterThan(20) // We have many heroes
    expect(stats.heroesWithPrompts).toBe(stats.totalHeroes) // All should have prompts
    expect(stats.missingPrompts).toBe(0) // No missing prompts
    expect(stats.coveragePercentage).toBe(100) // 100% coverage
  })

  test('should have no critical heroes missing prompts', () => {
    const missingCritical = getCriticalMissingHeroes()

    expect(missingCritical).toHaveLength(0)
  })

  test('should validate all heroes in registry', () => {
    const heroNames = Object.keys(HEROES_REGISTRY) as HeroName[]

    const validationResults = heroNames.map(hero => validateHero(hero))

    // All heroes should be valid
    expect(validationResults.every(r => r.isValid)).toBe(true)

    // No heroes should have errors
    expect(validationResults.every(r => r.error === null)).toBe(true)
  })

  test('should have consistent hero metadata', () => {
    const heroes = Object.values(HEROES_REGISTRY)

    heroes.forEach(hero => {
      expect(hero.name).toBeTruthy()
      expect(['male', 'female'].includes(hero.gender)).toBe(true)
      expect(typeof hero.hasPrompt).toBe('boolean')
      expect(['critical', 'popular', 'special'].includes(hero.category)).toBe(true)
      expect(typeof hero.priority).toBe('number')
      expect(hero.priority).toBeGreaterThan(0)
    })
  })
})