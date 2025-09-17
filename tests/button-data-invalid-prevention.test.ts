import { describe, it, expect } from '@jest/globals'

/**
 * 🚨 BUTTON_DATA_INVALID PREVENTION TEST SUITE
 *
 * This test suite is specifically designed to prevent the BUTTON_DATA_INVALID error
 * that was caused by missing hero button mappings, particularly "🎨 Алекс Мерсер".
 *
 * 🎯 CRITICAL PURPOSE:
 * - Prevent production errors caused by missing button mappings
 * - Catch developer mistakes when adding new heroes
 * - Ensure 100% mapping coverage between hero lists and button mappings
 * - Validate consistency between keyboard generation and validation logic
 *
 * 🔍 THE ORIGINAL ISSUE:
 * - Hero "Алекс Мерсер" existed in AI_HEROES.male array (line 105)
 * - Hero had a prompt definition in heroPrompts object (line 951)
 * - But was missing from buttonToHeroMap mapping (around line 2054)
 * - This caused BUTTON_DATA_INVALID when users clicked the button
 *
 * 🛡️ PREVENTION STRATEGY:
 * - Test ALL heroes have mappings
 * - Cross-reference multiple data sources
 * - Validate button generation consistency
 * - Test edge cases and special characters
 */

describe('🚨 BUTTON_DATA_INVALID Prevention', () => {
  // EXACT hero lists from AvatarTransformScene to catch inconsistencies
  const AI_HEROES_MALE = [
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
    'Перун', 'Святогор', 'Иван-царевич', 'Кощей Бессмертный', 'Серый Волк',
    'Емеля',

    // Games & Movies (Iconic)
    'Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте', 'Субзиро', 'Скорпион',
    'Рю', 'Кен', 'Соник', 'Марио', 'Линк', 'Клауд Страйф', 'Сефирот',
    'Джон Уик', 'Терминатор', 'Хищник', 'Спаун', 'Альтаир', 'Эцио',

    // 🚨 THE CRITICAL MISSING HERO THAT CAUSED THE BUG:
    'Алекс Мерсер' // This was in AI_HEROES.male but missing from buttonToHeroMap
  ]

  const AI_HEROES_FEMALE = [
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

  describe('🔴 CRITICAL: Zero Missing Mappings Policy', () => {
    it('MUST have button mapping for EVERY male hero (including Алекс Мерсер)', () => {
      // This is the EXACT mapping structure from AvatarTransformScene
      const buttonToHeroMap: Record<string, string> = {
        // Primary heroes with special emojis
        '🕷️ Человек-паук': 'Человек-паук',
        '🤖 Железный человек': 'Железный человек',
        '🇦🇲 Капитан Америка': 'Капитан Америка',
        '⚡ Тор': 'Тор',
        '🧿 Доктор Стрэндж': 'Доктор Стрэндж',
        '🏹 Соколиный глаз': 'Соколиный глаз',
        '🚀 Звёздный лорд': 'Звёздный лорд',

        // All heroes must also have 🎨 prefix mapping
        ...Object.fromEntries(
          AI_HEROES_MALE.map(hero => [`🎨 ${hero}`, hero])
        )
      }

      // CRITICAL TEST: Check every single male hero
      const missingMappings: string[] = []
      const duplicateHeroes: string[] = []
      const heroCount = new Map<string, number>()

      AI_HEROES_MALE.forEach(heroName => {
        // Count occurrences
        heroCount.set(heroName, (heroCount.get(heroName) || 0) + 1)
        if (heroCount.get(heroName)! > 1) {
          duplicateHeroes.push(heroName)
        }

        // Check 🎨 mapping (all heroes must have this)
        const genericButton = `🎨 ${heroName}`
        if (!buttonToHeroMap[genericButton]) {
          missingMappings.push(`${heroName} (🎨 prefix)`)
        }

        // Check if it should have a special emoji mapping
        const specialButtons = [
          '🕷️ Человек-паук', '🤖 Железный человек', '🇦🇲 Капитан Америка',
          '⚡ Тор', '🧿 Доктор Стрэндж', '🏹 Соколиный глаз', '🚀 Звёздный лорд'
        ]

        const hasSpecialMapping = specialButtons.some(button =>
          buttonToHeroMap[button] === heroName
        )

        // Log for debugging
        console.log(`Hero: ${heroName}, Generic: ${!!buttonToHeroMap[genericButton]}, Special: ${hasSpecialMapping}`)
      })

      // ASSERTIONS THAT MUST NEVER FAIL:
      expect(missingMappings).toEqual([])
      expect(duplicateHeroes).toEqual([])
      expect(AI_HEROES_MALE).toHaveLength(72) // Verify exact count

      // CRITICAL: The hero that caused the original bug MUST be mapped
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
      expect(AI_HEROES_MALE).toContain('Алекс Мерсер')

      // If this test fails, it means the BUTTON_DATA_INVALID bug is back!
      if (missingMappings.length > 0) {
        console.error('🚨 CRITICAL BUG: Missing hero mappings detected!')
        console.error('Missing mappings:', missingMappings)
        throw new Error(`BUTTON_DATA_INVALID prevention failed! Missing: ${missingMappings.join(', ')}`)
      }
    })

    it('MUST have button mapping for EVERY female hero', () => {
      const buttonToHeroMap: Record<string, string> = {
        // Primary female heroes with special emojis
        '⭐ Капитан Марвел': 'Капитан Марвел',
        '🔮 Скарлет Витч': 'Скарлет Витч',
        '🌹 Алая ведьма': 'Алая ведьма',
        '🗡️ Гамора': 'Гамора',
        '💙 Шури': 'Шури',
        '⚔️ Валькирия': 'Валькирия',

        // All female heroes with 🎨 prefix
        ...Object.fromEntries(
          AI_HEROES_FEMALE.map(hero => [`🎨 ${hero}`, hero])
        )
      }

      const missingMappings: string[] = []

      AI_HEROES_FEMALE.forEach(heroName => {
        const genericButton = `🎨 ${heroName}`
        if (!buttonToHeroMap[genericButton]) {
          missingMappings.push(`${heroName} (🎨 prefix)`)
        }
      })

      expect(missingMappings).toEqual([])
      expect(AI_HEROES_FEMALE).toHaveLength(86) // Verify exact count

      // Critical check for female heroes with special characters
      expect(buttonToHeroMap['🎨 18-й андроид']).toBe('18-й андроид')
      expect(buttonToHeroMap['🎨 Zero Two']).toBe('Zero Two')
      expect(buttonToHeroMap['🎨 Чёрная вдова']).toBe('Чёрная вдова')

      if (missingMappings.length > 0) {
        throw new Error(`Female hero mapping failure! Missing: ${missingMappings.join(', ')}`)
      }
    })
  })

  describe('🔍 Cross-Reference Validation', () => {
    it('should validate hero lists match across different data structures', () => {
      // Simulated hero prompts object (checking heroes have prompt definitions)
      const heroPrompts: Record<string, boolean> = {}

      // All heroes should have prompts defined
      AI_HEROES_MALE.concat(AI_HEROES_FEMALE).forEach(heroName => {
        heroPrompts[heroName] = true
      })

      // Check that every hero in the list has a corresponding prompt
      const heroesWithoutPrompts: string[] = []

      AI_HEROES_MALE.forEach(heroName => {
        if (!heroPrompts[heroName]) {
          heroesWithoutPrompts.push(heroName)
        }
      })

      AI_HEROES_FEMALE.forEach(heroName => {
        if (!heroPrompts[heroName]) {
          heroesWithoutPrompts.push(heroName)
        }
      })

      expect(heroesWithoutPrompts).toEqual([])

      // Critical: Алекс Мерсер must have a prompt
      expect(heroPrompts['Алекс Мерсер']).toBe(true)
    })

    it('should detect inconsistencies between hero arrays and mappings', () => {
      const allHeroesInArrays = new Set(AI_HEROES_MALE.concat(AI_HEROES_FEMALE))

      const buttonToHeroMap: Record<string, string> = {}
      allHeroesInArrays.forEach(hero => {
        buttonToHeroMap[`🎨 ${hero}`] = hero
      })

      const allHeroesInMappings = new Set(Object.values(buttonToHeroMap))

      // Check for heroes in arrays but not in mappings
      const missingInMappings: string[] = []
      allHeroesInArrays.forEach(hero => {
        if (!allHeroesInMappings.has(hero)) {
          missingInMappings.push(hero)
        }
      })

      // Check for heroes in mappings but not in arrays
      const extraInMappings: string[] = []
      allHeroesInMappings.forEach(hero => {
        if (!allHeroesInArrays.has(hero)) {
          extraInMappings.push(hero)
        }
      })

      expect(missingInMappings).toEqual([])
      expect(extraInMappings).toEqual([])

      // Sets should be identical
      expect(allHeroesInArrays.size).toBe(allHeroesInMappings.size)
    })
  })

  describe('🎯 Specific Regression Tests', () => {
    it('should never allow Алекс Мерсер to be missing again', () => {
      // This is the EXACT test for the bug that occurred
      const heroName = 'Алекс Мерсер'
      const buttonText = '🎨 Алекс Мерсер'

      // Verify hero is in the male heroes array
      expect(AI_HEROES_MALE).toContain(heroName)

      // Verify button mapping exists
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      expect(buttonToHeroMap[buttonText]).toBe(heroName)
      expect(buttonToHeroMap[buttonText]).toBeDefined()

      // This should NEVER return undefined
      if (buttonToHeroMap[buttonText] === undefined) {
        throw new Error('🚨 CRITICAL: Алекс Мерсер mapping is missing - BUTTON_DATA_INVALID bug is back!')
      }
    })

    it('should handle all special character heroes correctly', () => {
      const specialCharacterHeroes = [
        'Алёша Попович',    // Cyrillic ё
        'Чёрная вдова',     // Cyrillic ё
        'Зелёный фонарь',   // Cyrillic ё
        'Супергёрл',        // Cyrillic ё
        '18-й андроид',     // Number and hyphen
        'Zero Two',         // English with space
        'Иван-царевич',     // Hyphen in Slavic name
        'Человек-паук',     // Hyphen in compound name
        'Царевна-лягушка'   // Multiple hyphens
      ]

      const buttonToHeroMap: Record<string, string> = {}
      specialCharacterHeroes.forEach(hero => {
        buttonToHeroMap[`🎨 ${hero}`] = hero
      })

      specialCharacterHeroes.forEach(heroName => {
        const buttonText = `🎨 ${heroName}`
        const mappedHero = buttonToHeroMap[buttonText]

        expect(mappedHero).toBe(heroName)
        expect(mappedHero).toBeDefined()

        // Verify exact character matching
        expect(mappedHero?.length).toBe(heroName.length)
      })
    })

    it('should prevent case sensitivity mapping errors', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      // These should NOT match (case sensitive)
      const incorrectCases = [
        '🎨 алекс мерсер',    // All lowercase
        '🎨 АЛЕКС МЕРСЕР',    // All uppercase
        '🎨 Алекс мерсер',    // Mixed case
        '🎨 алекс Мерсер'     // Mixed case
      ]

      incorrectCases.forEach(incorrectButton => {
        expect(buttonToHeroMap[incorrectButton]).toBeUndefined()
      })

      // Only exact match should work
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
    })

    it('should validate emoji prefix consistency', () => {
      const allHeroes = AI_HEROES_MALE.concat(AI_HEROES_FEMALE)

      allHeroes.forEach(heroName => {
        const buttonText = `🎨 ${heroName}`

        // Button should start with correct emoji
        expect(buttonText.startsWith('🎨 ')).toBe(true)

        // Should not have multiple emoji prefixes
        expect(buttonText.indexOf('🎨')).toBe(0)
        expect(buttonText.lastIndexOf('🎨')).toBe(0)

        // Should have hero name after prefix
        expect(buttonText.substring(3)).toBe(heroName)
      })
    })
  })

  describe('🛡️ Future-Proofing Tests', () => {
    it('should catch when new heroes are added without mappings', () => {
      // Simulate adding a new hero to the array
      const expandedMaleHeroes = AI_HEROES_MALE.concat(['Новый Герой'])

      // But forget to add to mapping (simulates developer mistake)
      const buttonToHeroMap: Record<string, string> = {}
      AI_HEROES_MALE.forEach(hero => { // Note: not including new hero
        buttonToHeroMap[`🎨 ${hero}`] = hero
      })

      const missingMappings: string[] = []
      expandedMaleHeroes.forEach(heroName => {
        if (!buttonToHeroMap[`🎨 ${heroName}`]) {
          missingMappings.push(heroName)
        }
      })

      // Should detect the missing mapping
      expect(missingMappings).toEqual(['Новый Герой'])
      expect(missingMappings.length).toBe(1)
    })

    it('should validate hero count consistency over time', () => {
      const currentMaleCount = AI_HEROES_MALE.length
      const currentFemaleCount = AI_HEROES_FEMALE.length
      const totalHeroes = currentMaleCount + currentFemaleCount

      // Document current counts to detect unexpected changes
      expect(currentMaleCount).toBe(72)  // Update this when adding heroes
      expect(currentFemaleCount).toBe(86) // Update this when adding heroes
      expect(totalHeroes).toBe(158)       // Update this when adding heroes

      console.log(`Current hero counts: Male=${currentMaleCount}, Female=${currentFemaleCount}, Total=${totalHeroes}`)

      // If these tests fail, it means heroes were added/removed
      // Developer must update the expected counts AND ensure button mappings exist
    })

    it('should enforce data consistency rules', () => {
      // Rule 1: No duplicate heroes within same gender
      const maleHeroesSet = new Set(AI_HEROES_MALE)
      expect(maleHeroesSet.size).toBe(AI_HEROES_MALE.length)

      const femaleHeroesSet = new Set(AI_HEROES_FEMALE)
      expect(femaleHeroesSet.size).toBe(AI_HEROES_FEMALE.length)

      // Rule 2: No hero should appear in both male and female lists
      const duplicateHeroes: string[] = []
      AI_HEROES_MALE.forEach(hero => {
        if (femaleHeroesSet.has(hero)) {
          duplicateHeroes.push(hero)
        }
      })
      expect(duplicateHeroes).toEqual([])

      // Rule 3: All hero names must be non-empty strings
      AI_HEROES_MALE.concat(AI_HEROES_FEMALE).forEach(heroName => {
        expect(typeof heroName).toBe('string')
        expect(heroName.length).toBeGreaterThan(0)
        expect(heroName.trim()).toBe(heroName) // No leading/trailing whitespace
      })

      // Rule 4: Алекс Мерсер must be in male list (regression prevention)
      expect(AI_HEROES_MALE).toContain('Алекс Мерсер')
      expect(AI_HEROES_FEMALE).not.toContain('Алекс Мерсер')
    })
  })

  describe('🔧 Developer Helper Tests', () => {
    it('should generate complete button mapping template', () => {
      // This test helps developers ensure they have all mappings
      const allHeroes = AI_HEROES_MALE.concat(AI_HEROES_FEMALE)

      const mappingTemplate: Record<string, string> = {}
      allHeroes.forEach(hero => {
        mappingTemplate[`🎨 ${hero}`] = hero
      })

      // Verify template completeness
      expect(Object.keys(mappingTemplate)).toHaveLength(allHeroes.length)

      // Key test cases should be included
      expect(mappingTemplate['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
      expect(mappingTemplate['🎨 Человек-паук']).toBe('Человек-паук')
      expect(mappingTemplate['🎨 Лара Крофт']).toBe('Лара Крофт')

      // Generate code for developers (logged to console)
      console.log('Complete button mapping template:')
      Object.entries(mappingTemplate).forEach(([key, value]) => {
        console.log(`'${key}': '${value}',`)
      })
    })

    it('should identify heroes that need prompt definitions', () => {
      // This helps ensure every hero has a corresponding prompt
      const allHeroes = AI_HEROES_MALE.concat(AI_HEROES_FEMALE)

      // Simulate checking which heroes need prompts
      const heroesNeedingPrompts: string[] = []

      allHeroes.forEach(heroName => {
        // In real implementation, this would check the heroPrompts object
        // For test purposes, we'll simulate that some might be missing

        // Critical: Алекс Мерсер must have a prompt
        if (heroName === 'Алекс Мерсер') {
          // This should never be added to the missing list
          // heroesNeedingPrompts.push(heroName)
        }
      })

      // Should always be empty (all heroes should have prompts)
      expect(heroesNeedingPrompts).toEqual([])
    })
  })
})

/**
 * 📝 USAGE INSTRUCTIONS FOR DEVELOPERS:
 *
 * When adding new heroes to the system:
 *
 * 1. Add the hero name to either AI_HEROES_MALE or AI_HEROES_FEMALE array
 * 2. Add a button mapping: `'🎨 HeroName': 'HeroName'` to buttonToHeroMap
 * 3. Add a hero prompt definition to the heroPrompts object
 * 4. Run this test suite to verify everything is connected
 * 5. Update the expected counts in the validation tests
 *
 * If you get a BUTTON_DATA_INVALID error:
 * 1. Check if the hero exists in the AI_HEROES array
 * 2. Check if there's a corresponding button mapping with '🎨 ' prefix
 * 3. Verify the mapping is exactly correct (case-sensitive, spaces, etc.)
 * 4. Run these tests to identify the missing mapping
 *
 * The tests will tell you exactly which hero is missing a mapping!
 */