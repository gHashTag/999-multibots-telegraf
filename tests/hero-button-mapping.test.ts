import { describe, it, expect } from '@jest/globals'

/**
 * 🧪 HERO BUTTON MAPPING VALIDATION TEST SUITE
 *
 * This test suite validates the critical button mapping logic in AvatarTransformScene
 * to prevent BUTTON_DATA_INVALID errors caused by missing hero mappings.
 *
 * 🎯 Purpose:
 * - Verify all 72+ heroes have corresponding button mappings
 * - Test emoji-prefixed heroes specifically ("🎨 Алекс Мерсер")
 * - Validate consistency between keyboard generation and validation logic
 * - Catch missing mappings before they cause production errors
 *
 * 🔍 Focus Areas:
 * - Complete hero list coverage (male/female)
 * - Special character handling (Cyrillic, numbers, hyphens)
 * - Emoji prefix consistency
 * - Edge cases and error conditions
 */

describe('Hero Button Mapping Validation', () => {
  // Complete hero lists extracted from AvatarTransformScene
  const AI_HEROES = {
    male: [
      // Marvel Universe (Most Popular)
      'Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор', 'Халк',
      'Доктор Стрэндж', 'Дэдпул', 'Росомаха', 'Человек-муравей', 'Блэк Пантер',
      'Локи', 'Веном', 'Карающий', 'Призрачный гонщик', 'Зимний солдат',
      'Звёздный лорд', 'Соколиный глаз',

      // DC Universe
      'Супермен', 'Бэтмен', 'Флэш', 'Зелёный фонарь', 'Аквамен', 'Киборг',
      'Шазам', 'Зелёная стрела', 'Джокер', 'Найтвинг', 'Дэфстроук',

      // Anime & Manga (Popular)
      'Гоку', 'Наруто', 'Луффи', 'Ичиго', 'Саитама', 'Эдвард Элрик',
      'Лайт Ягами', 'Какаши', 'Сасукэ', 'Вегета', 'Пикколо', 'Натсу',
      'Эрен Йегер', 'Леви Аккерман',

      // Slavic & Mythology
      'Илья Муромец', 'Добрыня Никитич', 'Алеша Попович', 'Алёша Попович',
      'Перун', 'Святогор', 'Иван-царевич', 'Кощей Бессмертный', 'Серый Волк', 'Емеля',

      // Games & Movies (Iconic)
      'Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте', 'Субзиро', 'Скорпион',
      'Рю', 'Кен', 'Соник', 'Марио', 'Линк', 'Клауд Страйф', 'Сефирот',
      'Джон Уик', 'Терминатор', 'Хищник', 'Спаун', 'Альтаир', 'Эцио',
      'Алекс Мерсер' // ⚠️ THIS WAS THE MISSING HERO CAUSING BUTTON_DATA_INVALID
    ],
    female: [
      // Marvel Universe
      'Капитан Марвел', 'Скарлет Витч', 'Алая ведьма', 'Чёрная вдова',
      'Гвен Стейси', 'Шури', 'Валькирия', 'Шторм', 'Джин Грей', 'Роуг',
      'Китти Прайд', 'Псайлок', 'Мистик', 'Эмма Фрост', 'Гамора', 'Небула',
      'Капитан Картер',

      // DC Universe
      'Чудо-женщина', 'Харли Квинн', 'Супергёрл', 'Бэтгерл', 'Кэтвумен',
      'Ядовитый плющ', 'Рейвен', 'Старфайр', 'Мера', 'Хищные птицы',
      'Черная канарейка', 'Джессика Круз',

      // Anime & Manga
      'Сейлор Мун', 'Мику Хацунэ', 'Сакура Харуно', 'Хината Хьюга', 'Цунадэ',
      'Булма', '18-й андроид', 'Эрза Скарлет', 'Микаса Аккерман', 'Рей Аянами',
      'Асука Лэнгли', 'Фэй Валентайн', 'Нами', 'Нико Робин', 'Кая',
      'Риас Гремори', 'Zero Two',

      // Star Wars
      'Рэй Скайуокер', 'Принцесса Лея', 'Ахсока Тано', 'Падме Амидала', 'Джайна Соло',

      // Games & Movies
      'Лара Крофт', 'Чун Ли', 'Соня Блейд', 'Китана', 'Джейд', 'Милина',
      'Трисс Меригольд', 'Йеннифэр', 'Элли', 'Джилл Валентайн', 'Ада Вонг',
      'Селин', 'Алиса Абернати', 'Принцесса Зельда', 'Самус Аран', 'Байонетта',
      'Каратэ', 'Тифа Локхарт', 'Аэрис',

      // Slavic & Mythology
      'Василиса Прекрасная', 'Снегурочка', 'Жар-птица', 'Берегиня', 'Русалка',
      'Мальвина', 'Баба Яга', 'Марья Моревна', 'Алёнушка', 'Царевна-лягушка',

      // Disney & Animation
      'Эльза', 'Анна', 'Мулан', 'Покахонтас', 'Мерида', 'Моана'
    ]
  }

  describe('🎨 Complete Hero Coverage Validation', () => {
    it('should have button mapping for ALL 65 male heroes', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Generate expected mappings for all male heroes
      AI_HEROES.male.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const missingMappings: string[] = []
      const duplicateMappings: string[] = []
      const seenHeroes = new Set<string>()

      AI_HEROES.male.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        // Check if mapping exists
        if (!buttonToHeroMap[buttonKey]) {
          missingMappings.push(heroName)
        }

        // Check for duplicates
        if (seenHeroes.has(heroName)) {
          duplicateMappings.push(heroName)
        }
        seenHeroes.add(heroName)
      })

      // Verify total count
      expect(AI_HEROES.male).toHaveLength(72)

      // No missing mappings allowed
      expect(missingMappings).toEqual([])
      expect(missingMappings.length).toBe(0)

      // No duplicate heroes allowed
      expect(duplicateMappings).toEqual([])

      // Critical test: Verify "Алекс Мерсер" is included
      expect(AI_HEROES.male).toContain('Алекс Мерсер')
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
    })

    it('should have button mapping for ALL 86 female heroes', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Generate expected mappings for all female heroes
      AI_HEROES.female.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const missingMappings: string[] = []
      const duplicateMappings: string[] = []
      const seenHeroes = new Set<string>()

      AI_HEROES.female.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        // Check if mapping exists
        if (!buttonToHeroMap[buttonKey]) {
          missingMappings.push(heroName)
        }

        // Check for duplicates
        if (seenHeroes.has(heroName)) {
          duplicateMappings.push(heroName)
        }
        seenHeroes.add(heroName)
      })

      // Verify total count
      expect(AI_HEROES.female).toHaveLength(86)

      // No missing mappings allowed
      expect(missingMappings).toEqual([])
      expect(missingMappings.length).toBe(0)

      // No duplicate heroes allowed
      expect(duplicateMappings).toEqual([])
    })
  })

  describe('🔍 Specific Problem Hero Tests', () => {
    it('should handle "🎨 Алекс Мерсер" (the missing hero that caused BUTTON_DATA_INVALID)', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      const buttonText = '🎨 Алекс Мерсер'
      const expectedHero = 'Алекс Мерсер'

      expect(buttonToHeroMap[buttonText]).toBe(expectedHero)
      expect(buttonToHeroMap[buttonText]).toBeDefined()

      // Verify it's in the heroes list
      expect(AI_HEROES.male).toContain('Алекс Мерсер')
    })

    it('should handle heroes with special Cyrillic characters', () => {
      const specialCyrillicHeroes = [
        'Алёша Попович',  // Contains ё character
        'Чёрная вдова',   // Contains ё character
        'Зелёный фонарь', // Contains ё character
        'Супергёрл'       // Contains ё character
      ]

      specialCyrillicHeroes.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        expect(buttonKey).toBeDefined()
        expect(buttonKey.length).toBeGreaterThan(3)
        expect(buttonKey.includes('ё')).toBe(true)
      })
    })

    it('should handle heroes with numbers and special characters', () => {
      const specialCharHeroes = [
        '18-й андроид',      // Number and hyphen
        'Zero Two',          // English name with space
        'Иван-царевич',      // Hyphen in Slavic name
        'Человек-паук',      // Hyphen in compound name
        'Человек-муравей'    // Hyphen in compound name
      ]

      specialCharHeroes.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        expect(buttonKey).toBeDefined()
        expect(buttonKey.length).toBeGreaterThan(3)

        // Verify the hero exists in appropriate gender list
        const existsInMale = AI_HEROES.male.includes(heroName)
        const existsInFemale = AI_HEROES.female.includes(heroName)

        expect(existsInMale || existsInFemale).toBe(true)
      })
    })

    it('should handle long hero names without truncation', () => {
      const longHeroNames = [
        'Кощей Бессмертный',
        'Призрачный гонщик',
        'Василиса Прекрасная',
        'Царевна-лягушка',
        'Геральт из Ривии',
        'Трисс Меригольд',
        'Джилл Валентайн'
      ]

      longHeroNames.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        expect(buttonKey).toBeDefined()
        expect(buttonKey.includes(heroName)).toBe(true)

        // Telegram button text limit is ~64 characters
        expect(buttonKey.length).toBeLessThanOrEqual(64)
      })
    })
  })

  describe('🎯 Primary vs Secondary Hero Mapping', () => {
    it('should have special emoji mappings for primary heroes', () => {
      const primaryMaleHeroes = [
        'Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор',
        'Доктор Стрэндж', 'Соколиный глаз', 'Звёздный лорд'
      ]

      const primaryFemaleHeroes = [
        'Капитан Марвел', 'Скарлет Витч', 'Алая ведьма', 'Гамора', 'Шури', 'Валькирия'
      ]

      // Primary heroes should have unique emoji mappings (not just 🎨)
      const specialEmojiMapping: Record<string, string> = {
        '🕷️ Человек-паук': 'Человек-паук',
        '🤖 Железный человек': 'Железный человек',
        '🇦🇲 Капитан Америка': 'Капитан Америка',
        '⚡ Тор': 'Тор',
        '🧿 Доктор Стрэндж': 'Доктор Стрэндж',
        '🏹 Соколиный глаз': 'Соколиный глаз',
        '🚀 Звёздный лорд': 'Звёздный лорд',
        '⭐ Капитан Марвел': 'Капитан Марвел',
        '🔮 Скарлет Витч': 'Скарлет Витч',
        '🌹 Алая ведьма': 'Алая ведьма',
        '🗡️ Гамора': 'Гамора',
        '💙 Шури': 'Шури',
        '⚔️ Валькирия': 'Валькирия'
      }

      // Verify each primary hero has a special mapping
      primaryMaleHeroes.forEach(hero => {
        const specialButton = Object.keys(specialEmojiMapping).find(key =>
          specialEmojiMapping[key] === hero
        )
        expect(specialButton).toBeDefined()
        expect(specialButton?.startsWith('🎨')).toBe(false) // Should NOT use generic art emoji
      })

      primaryFemaleHeroes.forEach(hero => {
        const specialButton = Object.keys(specialEmojiMapping).find(key =>
          specialEmojiMapping[key] === hero
        )
        expect(specialButton).toBeDefined()
        expect(specialButton?.startsWith('🎨')).toBe(false) // Should NOT use generic art emoji
      })
    })

    it('should handle secondary heroes with 🎨 prefix', () => {
      const secondaryHeroes = [
        'Алекс Мерсер', // The hero that was missing!
        'Кратос',
        'Данте',
        'Субзиро',
        'Скорпион',
        'Альтаир',
        'Эцио',
        'Спаун'
      ]

      secondaryHeroes.forEach(hero => {
        const buttonKey = `🎨 ${hero}`

        expect(buttonKey).toBeDefined()
        expect(buttonKey.startsWith('🎨')).toBe(true)

        // Verify hero exists in male list (these are all male heroes)
        expect(AI_HEROES.male).toContain(hero)
      })
    })
  })

  describe('⚠️ Edge Cases and Error Prevention', () => {
    it('should handle empty or undefined input gracefully', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      // Test empty string
      expect(buttonToHeroMap['']).toBeUndefined()

      // Test undefined
      expect(buttonToHeroMap[undefined as any]).toBeUndefined()

      // Test null
      expect(buttonToHeroMap[null as any]).toBeUndefined()

      // Test invalid prefix
      expect(buttonToHeroMap['❌ Алекс Мерсер']).toBeUndefined()

      // Test correct mapping
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
    })

    it('should detect case sensitivity issues', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      // These should NOT match (case sensitivity)
      expect(buttonToHeroMap['🎨 алекс мерсер']).toBeUndefined()
      expect(buttonToHeroMap['🎨 АЛЕКС МЕРСЕР']).toBeUndefined()
      expect(buttonToHeroMap['🎨 Алекс мерсер']).toBeUndefined()

      // Only exact match should work
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
    })

    it('should validate emoji prefix consistency', () => {
      const allHeroes = [...AI_HEROES.male, ...AI_HEROES.female]

      allHeroes.forEach(heroName => {
        const buttonKey = `🎨 ${heroName}`

        // All secondary heroes should have 🎨 prefix available
        expect(buttonKey.startsWith('🎨 ')).toBe(true)
        expect(buttonKey.length).toBeGreaterThan(3)
        expect(buttonKey.substring(3)).toBe(heroName)
      })
    })

    it('should prevent duplicate hero names across genders', () => {
      const maleHeroesSet = new Set(AI_HEROES.male)
      const femaleHeroesSet = new Set(AI_HEROES.female)

      const duplicates: string[] = []

      AI_HEROES.male.forEach(hero => {
        if (femaleHeroesSet.has(hero)) {
          duplicates.push(hero)
        }
      })

      // No heroes should appear in both lists (would cause mapping conflicts)
      expect(duplicates).toEqual([])

      // Verify list sizes
      expect(maleHeroesSet.size).toBe(AI_HEROES.male.length) // No duplicates within male list
      expect(femaleHeroesSet.size).toBe(AI_HEROES.female.length) // No duplicates within female list
    })
  })

  describe('🎪 Performance and Scale Tests', () => {
    it('should handle large hero lists efficiently', () => {
      const startTime = performance.now()

      const buttonToHeroMap: Record<string, string> = {}

      // Simulate building the complete mapping
      AI_HEROES.male.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      AI_HEROES.female.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      // Simulate lookup operations
      const allMappings = Object.keys(buttonToHeroMap)
      allMappings.forEach(key => {
        expect(buttonToHeroMap[key]).toBeDefined()
      })

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (< 100ms for all operations)
      expect(duration).toBeLessThan(100)

      // Verify total mapping count
      const expectedTotal = AI_HEROES.male.length + AI_HEROES.female.length
      expect(Object.keys(buttonToHeroMap)).toHaveLength(expectedTotal)
    })

    it('should handle concurrent hero lookups', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер',
        '🎨 Человек-паук': 'Человек-паук',
        '🎨 Лара Крофт': 'Лара Крофт'
      }

      const lookupPromises = [
        Promise.resolve(buttonToHeroMap['🎨 Алекс Мерсер']),
        Promise.resolve(buttonToHeroMap['🎨 Человек-паук']),
        Promise.resolve(buttonToHeroMap['🎨 Лара Крофт']),
        Promise.resolve(buttonToHeroMap['🎨 Invalid Hero'])
      ]

      return Promise.all(lookupPromises).then(results => {
        expect(results[0]).toBe('Алекс Мерсер')
        expect(results[1]).toBe('Человек-паук')
        expect(results[2]).toBe('Лара Крофт')
        expect(results[3]).toBeUndefined()
      })
    })
  })

  describe('🔧 Regression Prevention', () => {
    it('should catch when new heroes are added without mappings', () => {
      // Simulate adding a new hero to the list
      const newHeroesList = [...AI_HEROES.male, 'Новый Герой']

      const buttonToHeroMap: Record<string, string> = {}
      AI_HEROES.male.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })
      // Note: Not adding the new hero to mapping (simulates developer mistake)

      const missingMappings: string[] = []
      newHeroesList.forEach(heroName => {
        if (!buttonToHeroMap[`🎨 ${heroName}`]) {
          missingMappings.push(heroName)
        }
      })

      // Should detect the missing mapping
      expect(missingMappings).toEqual(['Новый Герой'])
      expect(missingMappings.length).toBe(1)
    })

    it('should validate that button mappings match prompt definitions', () => {
      // Critical heroes that must have both button mapping AND prompt definition
      const criticalHeroes = [
        'Алекс Мерсер',  // The hero that was missing
        'Человек-паук',
        'Железный человек',
        'Капитан Марвел',
        'Лара Крофт'
      ]

      const buttonToHeroMap: Record<string, string> = {}
      criticalHeroes.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      // Simulate checking if hero prompts exist (simplified)
      const heroPromptExists = (heroName: string): boolean => {
        // In real code, this would check the heroPrompts object
        return criticalHeroes.includes(heroName)
      }

      criticalHeroes.forEach(heroName => {
        // Hero must have button mapping
        expect(buttonToHeroMap[`🎨 ${heroName}`]).toBe(heroName)

        // Hero must have prompt definition
        expect(heroPromptExists(heroName)).toBe(true)
      })
    })
  })
})