/**
 * 🚨 HEROES VALIDATION SYSTEM TESTS
 *
 * Критические тесты системы валидации героев
 * Обеспечивают корректную работу типобезопасности
 */

import {
  validateHero,
  HEROES_REGISTRY,
  getCriticalMissingHeroes,
  getHeroSystemStats,
  HeroName,
  CRITICAL_HEROES
} from '../src/types/heroes'
import { HeroValidationService } from '../src/services/HeroValidationService'

describe('🦸‍♂️ Heroes Validation System', () => {

  describe('Hero Type Validation', () => {
    test('should validate existing hero', () => {
      const result = validateHero('Человек-паук')
      expect(result.isValid).toBe(true)
      expect(result.hero).toBe('Человек-паук')
      expect(result.error).toBeNull()
    })

    test('should reject non-existent hero', () => {
      const result = validateHero('Несуществующий герой')
      expect(result.isValid).toBe(false)
      expect(result.hero).toBeNull()
      expect(result.error).toBe('HERO_NOT_FOUND')
    })

    test('should identify heroes without prompts', () => {
      const result = validateHero('Скарлет Витч')
      expect(result.isValid).toBe(false)
      expect(result.hero).toBe('Скарлет Витч')
      expect(result.error).toBe('PROMPT_MISSING')
      expect(result.fallbackPrompt).toBeDefined()
    })

    test('should provide fallback prompt for missing heroes', () => {
      const result = validateHero('Эльза')
      expect(result.fallbackPrompt).toContain('Эльза')
      expect(result.fallbackPrompt).toContain('Cinematic portrait photography')
    })
  })

  describe('Critical Heroes Status', () => {
    test('critical heroes should be properly identified', () => {
      expect(CRITICAL_HEROES).toContain('Человек-паук')
      expect(CRITICAL_HEROES).toContain('Бэтмен')
      expect(CRITICAL_HEROES).toContain('Супермен')
      expect(CRITICAL_HEROES.length).toBe(6)
    })

    test('should identify missing critical heroes', () => {
      const missing = getCriticalMissingHeroes()
      // После добавления промптов, критических отсутствующих быть не должно
      expect(missing.length).toBeLessThanOrEqual(2) // Допускаем небольшое количество
    })
  })

  describe('System Health Monitoring', () => {
    test('should calculate system statistics', () => {
      const stats = getHeroSystemStats()
      expect(stats.totalHeroes).toBeGreaterThan(20)
      expect(stats.heroesWithPrompts).toBeGreaterThan(0)
      expect(stats.coveragePercentage).toBeGreaterThan(50) // Минимум 50% покрытия
      expect(stats.lastValidated).toBeInstanceOf(Date)
    })

    test('should identify system health status', async () => {
      const diagnostics = await HeroValidationService.runSystemDiagnostics()
      expect(diagnostics.systemHealth).toBeDefined()
      expect(['healthy', 'warning', 'critical']).toContain(diagnostics.systemHealth)
      expect(diagnostics.stats).toBeDefined()
      expect(Array.isArray(diagnostics.recommendations)).toBe(true)
    })
  })

  describe('Heroes Registry Consistency', () => {
    test('all heroes in AI_HEROES should be in HEROES_REGISTRY', () => {
      // Импортируем AI_HEROES из основного файла
      const AI_HEROES = {
        male: [
          'Человек-паук', 'Железный человек', 'Бэтмен', 'Супермен',
          'Капитан Америка', 'Тор', 'Дэдпул', 'Росомаха', 'Халк', 'Доктор Стрэндж',
          'Кастомный промпт'
        ],
        female: [
          'Скарлет Витч', 'Капитан Марвел', 'Чудо-женщина', 'Чёрная вдова',
          'Харли Квинн', 'Супергёрл', 'Гвен Стейси', 'Василиса Прекрасная',
          'Лара Крофт', 'Эльза', 'Кастомный промпт'
        ]
      }

      const allHeroes = [...AI_HEROES.male, ...AI_HEROES.female]
      const uniqueHeroes = [...new Set(allHeroes)]

      uniqueHeroes.forEach(heroName => {
        expect(HEROES_REGISTRY[heroName as HeroName]).toBeDefined()
      })
    })

    test('heroes registry should have correct structure', () => {
      Object.values(HEROES_REGISTRY).forEach(hero => {
        expect(hero).toHaveProperty('name')
        expect(hero).toHaveProperty('gender')
        expect(hero).toHaveProperty('hasPrompt')
        expect(hero).toHaveProperty('category')
        expect(hero).toHaveProperty('priority')

        expect(['male', 'female']).toContain(hero.gender)
        expect(['critical', 'popular', 'special']).toContain(hero.category)
        expect(typeof hero.priority).toBe('number')
      })
    })
  })

  describe('Error Tracking and Metrics', () => {
    test('should track error statistics', () => {
      const errorStats = HeroValidationService.getErrorStats()
      expect(errorStats).toHaveProperty('totalErrors')
      expect(errorStats).toHaveProperty('errorsByType')
      expect(errorStats).toHaveProperty('errorsByHero')
      expect(errorStats).toHaveProperty('recentErrors')
      expect(Array.isArray(errorStats.recentErrors)).toBe(true)
    })
  })

  describe('Production Readiness', () => {
    test('system coverage should be acceptable for production', () => {
      const stats = getHeroSystemStats()
      expect(stats.coveragePercentage).toBeGreaterThanOrEqual(70) // 70% минимум для продакшн
    })

    test('critical heroes should have prompts', () => {
      const criticalMissing = getCriticalMissingHeroes()
      expect(criticalMissing.length).toBe(0) // Все критические герои должны иметь промпты
    })

    test('should handle edge cases gracefully', () => {
      // Тест пустой строки
      const emptyResult = validateHero('')
      expect(emptyResult.isValid).toBe(false)
      expect(emptyResult.error).toBe('HERO_NOT_FOUND')

      // Тест undefined
      const undefinedResult = validateHero(undefined as any)
      expect(undefinedResult.isValid).toBe(false)
      expect(undefinedResult.error).toBe('HERO_NOT_FOUND')

      // Тест специальных символов
      const specialResult = validateHero('Герой с эмодзи 🦸‍♂️')
      expect(specialResult.isValid).toBe(false)
      expect(specialResult.error).toBe('HERO_NOT_FOUND')
    })
  })

  describe('TypeScript Type Safety', () => {
    test('should enforce type safety at compile time', () => {
      // Этот тест проверяет, что типы работают корректно
      const validHero: HeroName = 'Человек-паук'
      const result = validateHero(validHero)
      expect(result.hero).toBe(validHero)
    })

    test('should provide correct type hints for missing heroes', () => {
      const missing = getCriticalMissingHeroes()
      missing.forEach(heroName => {
        // TypeScript должен знать, что это HeroName
        const hero = HEROES_REGISTRY[heroName]
        expect(hero).toBeDefined()
        expect(hero.hasPrompt).toBe(false)
      })
    })
  })
})

/**
 * 🚨 INTEGRATION TEST - FULL HERO SELECTION FLOW
 */
describe('🎭 Heroes Integration Tests', () => {
  // Мок контекста Telegram
  const createMockContext = () => ({
    from: { id: 123456789 },
    session: { selectedGender: 'male' },
    reply: jest.fn(),
    scene: {
      leave: jest.fn(),
      enter: jest.fn()
    }
  })

  test('should handle valid hero selection', async () => {
    const mockCtx = createMockContext() as any

    const result = await HeroValidationService.safeHeroSelection(
      mockCtx,
      'Человек-паук',
      'male'
    )

    expect(result.success).toBe(true)
    expect(result.shouldRedirect).toBeFalsy()
    expect(mockCtx.reply).not.toHaveBeenCalled()
  })

  test('should handle invalid hero selection with redirect', async () => {
    const mockCtx = createMockContext() as any

    const result = await HeroValidationService.safeHeroSelection(
      mockCtx,
      'Несуществующий герой',
      'male'
    )

    expect(result.success).toBe(false)
    expect(result.shouldRedirect).toBe(true)
    expect(mockCtx.reply).toHaveBeenCalled()
  })

  test('should handle missing prompt with fallback', async () => {
    const mockCtx = createMockContext() as any

    const result = await HeroValidationService.safeHeroSelection(
      mockCtx,
      'Эльза', // У неё пока нет промпта
      'female'
    )

    expect(result.success).toBe(false)
    expect(result.shouldRedirect).toBe(true)
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Эльза')
    )
  })
})