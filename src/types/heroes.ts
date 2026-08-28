/**
 * 🦸‍♂️ HEROES SYSTEM - TYPESCRIPT DEFINITIONS & VALIDATION
 *
 * Критическая система типобезопасности для героев
 * Предотвращает ошибки времени выполнения и обеспечивает полную валидацию
 */

export type Gender = 'male' | 'female'

export type HeroName =
  // МУЖСКИЕ ГЕРОИ
  | 'Человек-паук'
  | 'Железный человек'
  | 'Бэтмен'
  | 'Супермен'
  | 'Капитан Америка'
  | 'Тор'
  | 'Дэдпул'
  | 'Росомаха'
  | 'Халк'
  | 'Доктор Стрэндж'
  // ЖЕНСКИЕ ГЕРОИ
  | 'Скарлет Витч'
  | 'Капитан Марвел'
  | 'Чудо-женщина'
  | 'Чёрная вдова'
  | 'Харли Квинн'
  | 'Супергёрл'
  | 'Гвен Стейси'
  | 'Василиса Прекрасная'
  | 'Лара Крофт'
  | 'Эльза'
  // СПЕЦИАЛЬНЫЙ
  | 'Кастомный промпт'

export interface Hero {
  name: HeroName
  gender: Gender
  hasPrompt: boolean
  category: 'critical' | 'popular' | 'special'
  priority: number
}

export interface HeroPromptData {
  [key: string]: string
}

export interface HeroValidationResult {
  isValid: boolean
  hero: HeroName | null
  error: HeroValidationError | null
  fallbackPrompt?: string
}

export type HeroValidationError =
  | 'HERO_NOT_FOUND'
  | 'PROMPT_MISSING'
  | 'INVALID_GENDER'
  | 'SYSTEM_ERROR'

export interface HeroSystemMetrics {
  totalHeroes: number
  heroesWithPrompts: number
  missingPrompts: number
  coveragePercentage: number
  lastValidated: Date
}

export interface HeroErrorDetails {
  heroName: HeroName
  error: HeroValidationError
  timestamp: Date
  userId: string
  context: string
}

/**
 * 🚨 КРИТИЧЕСКИЕ ГЕРОИ - ОБЯЗАТЕЛЬНО ДОЛЖНЫ ИМЕТЬ ПРОМПТЫ
 */
export const CRITICAL_HEROES: HeroName[] = [
  'Человек-паук',
  'Железный человек',
  'Бэтмен',
  'Супермен',
  'Чудо-женщина',
  'Халк',
]

/**
 * 🎯 ПОЛНЫЙ СПИСОК ГЕРОЕВ С МЕТАДАННЫМИ
 */
export const HEROES_REGISTRY: Record<HeroName, Hero> = {
  // МУЖСКИЕ ГЕРОИ - ОБНОВЛЕНО ПОСЛЕ ДОБАВЛЕНИЯ ПРОМПТОВ
  'Человек-паук': {
    name: 'Человек-паук',
    gender: 'male',
    hasPrompt: true,
    category: 'critical',
    priority: 1,
  },
  'Железный человек': {
    name: 'Железный человек',
    gender: 'male',
    hasPrompt: true,
    category: 'critical',
    priority: 2,
  },
  Бэтмен: {
    name: 'Бэтмен',
    gender: 'male',
    hasPrompt: true,
    category: 'critical',
    priority: 3,
  }, // ✅ ДОБАВЛЕН
  Супермен: {
    name: 'Супермен',
    gender: 'male',
    hasPrompt: true,
    category: 'critical',
    priority: 4,
  }, // ✅ ДОБАВЛЕН
  'Капитан Америка': {
    name: 'Капитан Америка',
    gender: 'male',
    hasPrompt: true,
    category: 'popular',
    priority: 5,
  },
  Тор: {
    name: 'Тор',
    gender: 'male',
    hasPrompt: true,
    category: 'popular',
    priority: 6,
  },
  Дэдпул: {
    name: 'Дэдпул',
    gender: 'male',
    hasPrompt: true,
    category: 'popular',
    priority: 7,
  },
  Росомаха: {
    name: 'Росомаха',
    gender: 'male',
    hasPrompt: true,
    category: 'popular',
    priority: 8,
  },
  Халк: {
    name: 'Халк',
    gender: 'male',
    hasPrompt: true,
    category: 'critical',
    priority: 9,
  },
  'Доктор Стрэндж': {
    name: 'Доктор Стрэндж',
    gender: 'male',
    hasPrompt: true,
    category: 'popular',
    priority: 10,
  },

  // ЖЕНСКИЕ ГЕРОИ - ОБНОВЛЕНО ПОСЛЕ ДОБАВЛЕНИЯ ПРОМПТОВ
  'Скарлет Витч': {
    name: 'Скарлет Витч',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 11,
  }, // ✅ ДОБАВЛЕН
  'Капитан Марвел': {
    name: 'Капитан Марвел',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 12,
  }, // ✅ ДОБАВЛЕН
  'Чудо-женщина': {
    name: 'Чудо-женщина',
    gender: 'female',
    hasPrompt: true,
    category: 'critical',
    priority: 13,
  }, // ✅ ДОБАВЛЕН
  'Чёрная вдова': {
    name: 'Чёрная вдова',
    gender: 'female',
    hasPrompt: true,
    category: 'critical',
    priority: 14,
  }, // ✅ ДОБАВЛЕН
  'Харли Квинн': {
    name: 'Харли Квинн',
    gender: 'female',
    hasPrompt: true,
    category: 'critical',
    priority: 15,
  }, // ✅ ДОБАВЛЕН
  Супергёрл: {
    name: 'Супергёрл',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 16,
  }, // ✅ ДОБАВЛЕН
  'Гвен Стейси': {
    name: 'Гвен Стейси',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 17,
  }, // ✅ ДОБАВЛЕН
  'Василиса Прекрасная': {
    name: 'Василиса Прекрасная',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 18,
  }, // ✅ УЖЕ ЕСТЬ
  'Лара Крофт': {
    name: 'Лара Крофт',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 19,
  }, // ✅ ДОБАВЛЕН
  Эльза: {
    name: 'Эльза',
    gender: 'female',
    hasPrompt: true,
    category: 'popular',
    priority: 20,
  }, // ✅ ДОБАВЛЕН

  // СПЕЦИАЛЬНЫЙ
  'Кастомный промпт': {
    name: 'Кастомный промпт',
    gender: 'male',
    hasPrompt: true,
    category: 'special',
    priority: 21,
  },
}

/**
 * 📊 СТАТИСТИКА СИСТЕМЫ ГЕРОЕВ
 */
export function getHeroSystemStats(): HeroSystemMetrics {
  const heroes = Object.values(HEROES_REGISTRY)
  const heroesWithPrompts = heroes.filter(h => h.hasPrompt).length
  const totalHeroes = heroes.length

  return {
    totalHeroes,
    heroesWithPrompts,
    missingPrompts: totalHeroes - heroesWithPrompts,
    coveragePercentage: Math.round((heroesWithPrompts / totalHeroes) * 100),
    lastValidated: new Date(),
  }
}

/**
 * 🚨 ВАЛИДАЦИЯ ГЕРОЯ
 */
export function validateHero(heroName: string): HeroValidationResult {
  // Проверяем, есть ли герой в системе
  if (!Object.keys(HEROES_REGISTRY).includes(heroName)) {
    return {
      isValid: false,
      hero: null,
      error: 'HERO_NOT_FOUND',
    }
  }

  const hero = HEROES_REGISTRY[heroName as HeroName]

  // Проверяем, есть ли промпт
  if (!hero.hasPrompt) {
    return {
      isValid: false,
      hero: hero.name,
      error: 'PROMPT_MISSING',
      fallbackPrompt: generateFallbackPrompt(hero.name, hero.gender),
    }
  }

  return {
    isValid: true,
    hero: hero.name,
    error: null,
  }
}

/**
 * 🔄 FALLBACK ПРОМПТ ГЕНЕРАТОР
 */
function generateFallbackPrompt(heroName: HeroName, gender: Gender): string {
  const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`

  return `${baseSettings} A confident ${
    gender === 'male' ? 'man' : 'woman'
  } in modern stylish outfit inspired by ${heroName}. Professional studio lighting with bright, warm tones. Clean background with subtle color effects matching ${heroName}'s signature palette. The person wears fashionable glasses and has a charismatic expression. High-quality portrait photography with premium aesthetic.`
}

/**
 * 🎯 ПОЛУЧИТЬ КРИТИЧЕСКИХ ГЕРОЕВ БЕЗ ПРОМПТОВ
 */
export function getCriticalMissingHeroes(): HeroName[] {
  return CRITICAL_HEROES.filter(
    heroName => !HEROES_REGISTRY[heroName].hasPrompt
  )
}

/**
 * 📋 ПОЛУЧИТЬ ВСЕ ОТСУТСТВУЮЩИЕ ПРОМПТЫ
 */
export function getAllMissingPrompts(): HeroName[] {
  return Object.values(HEROES_REGISTRY)
    .filter(hero => !hero.hasPrompt && hero.name !== 'Кастомный промпт')
    .map(hero => hero.name)
}
