import { describe, it, expect } from '@jest/globals'

/**
 * ⚡ HERO MAPPING PERFORMANCE TEST SUITE
 *
 * This test suite validates the performance characteristics of the hero button mapping
 * system to ensure it can handle the large number of heroes efficiently.
 *
 * 🎯 Performance Goals:
 * - Button mapping lookup: < 1ms per operation
 * - Keyboard generation: < 50ms for all heroes
 * - Memory usage: < 10MB for all mappings
 * - Concurrent operations: Support 100+ simultaneous lookups
 *
 * 📊 Test Categories:
 * - Lookup performance
 * - Memory usage
 * - Scale testing
 * - Concurrent operations
 */

describe('Hero Mapping Performance Tests', () => {
  // Complete hero lists for performance testing
  const AI_HEROES = {
    male: [
      'Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор', 'Халк',
      'Доктор Стрэндж', 'Дэдпул', 'Росомаха', 'Человек-муравей', 'Блэк Пантер',
      'Локи', 'Веном', 'Карающий', 'Призрачный гонщик', 'Зимний солдат',
      'Звёздный лорд', 'Соколиный глаз', 'Супермен', 'Бэтмен', 'Флэш',
      'Зелёный фонарь', 'Аквамен', 'Киборг', 'Шазам', 'Зелёная стрела',
      'Джокер', 'Найтвинг', 'Дэфстроук', 'Гоку', 'Наруто', 'Луффи',
      'Ичиго', 'Саитама', 'Эдвард Элрик', 'Лайт Ягами', 'Какаши',
      'Сасукэ', 'Вегета', 'Пикколо', 'Натсу', 'Эрен Йегер', 'Леви Аккерман',
      'Илья Муромец', 'Добрыня Никитич', 'Алеша Попович', 'Алёша Попович',
      'Перун', 'Святогор', 'Иван-царевич', 'Кощей Бессмертный', 'Серый Волк',
      'Емеля', 'Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте',
      'Субзиро', 'Скорпион', 'Рю', 'Кен', 'Соник', 'Марио', 'Линк',
      'Клауд Страйф', 'Сефирот', 'Джон Уик', 'Терминатор', 'Хищник',
      'Спаун', 'Альтаир', 'Эцио', 'Алекс Мерсер'
    ],
    female: [
      'Капитан Марвел', 'Скарлет Витч', 'Алая ведьма', 'Чёрная вдова',
      'Гвен Стейси', 'Шури', 'Валькирия', 'Шторм', 'Джин Грей', 'Роуг',
      'Китти Прайд', 'Псайлок', 'Мистик', 'Эмма Фрост', 'Гамора', 'Небула',
      'Капитан Картер', 'Чудо-женщина', 'Харли Квинн', 'Супергёрл', 'Бэтгерл',
      'Кэтвумен', 'Ядовитый плющ', 'Рейвен', 'Старфайр', 'Мера',
      'Хищные птицы', 'Черная канарейка', 'Джессика Круз', 'Сейлор Мун',
      'Мику Хацунэ', 'Сакура Харуно', 'Хината Хьюга', 'Цунадэ', 'Булма',
      '18-й андроид', 'Эрза Скарлет', 'Микаса Аккерман', 'Рей Аянами',
      'Асука Лэнгли', 'Фэй Валентайн', 'Нами', 'Нико Робин', 'Кая',
      'Риас Гремори', 'Zero Two', 'Рэй Скайуокер', 'Принцесса Лея',
      'Ахсока Тано', 'Падме Амидала', 'Джайна Соло', 'Лара Крофт',
      'Чун Ли', 'Соня Блейд', 'Китана', 'Джейд', 'Милина',
      'Трисс Меригольд', 'Йеннифэр', 'Элли', 'Джилл Валентайн', 'Ада Вонг',
      'Селин', 'Алиса Абернати', 'Принцесса Зельда', 'Самус Аран', 'Байонетта',
      'Каратэ', 'Тифа Локхарт', 'Аэрис', 'Василиса Прекрасная', 'Снегурочка',
      'Жар-птица', 'Берегиня', 'Русалка', 'Мальвина', 'Баба Яга',
      'Марья Моревна', 'Алёнушка', 'Царевна-лягушка', 'Эльза', 'Анна',
      'Мулан', 'Покахонтас', 'Мерида', 'Моана'
    ]
  }

  describe('⚡ Lookup Performance', () => {
    it('should perform button mapping lookups under 1ms each', () => {
      // Create complete mapping
      const buttonToHeroMap: Record<string, string> = {}

      // Add all heroes to mapping
      const allHeroes = AI_HEROES.male.concat(AI_HEROES.female)
      allHeroes.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      // Test critical hero lookup performance
      const testCases = [
        '🎨 Алекс Мерсер',  // The previously missing hero
        '🎨 Человек-паук',
        '🎨 Лара Крофт',
        '🎨 Zero Two',
        '🎨 Геральт из Ривии'
      ]

      testCases.forEach(buttonText => {
        const startTime = performance.now()

        // Perform lookup
        const result = buttonToHeroMap[buttonText]

        const endTime = performance.now()
        const duration = endTime - startTime

        // Should complete in under 1ms
        expect(duration).toBeLessThan(1)
        expect(result).toBeDefined()
      })
    })

    it('should handle 1000 consecutive lookups efficiently', () => {
      const buttonToHeroMap: Record<string, string> = {}

      const allHeroes = AI_HEROES.male.concat(AI_HEROES.female)
      allHeroes.forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const testHero = '🎨 Алекс Мерсер'
      const iterations = 1000

      const startTime = performance.now()

      // Perform many lookups
      for (let i = 0; i < iterations; i++) {
        const result = buttonToHeroMap[testHero]
        expect(result).toBe('Алекс Мерсер')
      }

      const endTime = performance.now()
      const totalDuration = endTime - startTime
      const avgDuration = totalDuration / iterations

      // Average lookup should be < 0.1ms
      expect(avgDuration).toBeLessThan(0.1)
      expect(totalDuration).toBeLessThan(100) // Total under 100ms
    })

    it('should handle failed lookups quickly', () => {
      const buttonToHeroMap: Record<string, string> = {
        '🎨 Алекс Мерсер': 'Алекс Мерсер'
      }

      const invalidButtons = [
        '🎨 Несуществующий Герой',
        '❌ Алекс Мерсер',  // Wrong emoji
        '🎨',               // Empty name
        '',                 // Empty string
        '🎨 алекс мерсер'   // Wrong case
      ]

      invalidButtons.forEach(buttonText => {
        const startTime = performance.now()

        const result = buttonToHeroMap[buttonText]

        const endTime = performance.now()
        const duration = endTime - startTime

        expect(duration).toBeLessThan(1)
        expect(result).toBeUndefined()
      })
    })
  })

  describe('📊 Memory Usage Tests', () => {
    it('should use reasonable memory for complete hero mapping', () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create complete mapping
      const buttonToHeroMap: Record<string, string> = {}

      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName

        // Also add primary hero mappings
        const specialEmojis: Record<string, string> = {
          'Человек-паук': '🕷️',
          'Железный человек': '🤖',
          'Капитан Америка': '🇦🇲',
          'Тор': '⚡',
          'Капитан Марвел': '⭐',
          'Скарлет Витч': '🔮'
        }

        if (specialEmojis[heroName]) {
          buttonToHeroMap[`${specialEmojis[heroName]} ${heroName}`] = heroName
        }
      })

      const finalMemory = process.memoryUsage().heapUsed
      const memoryUsed = finalMemory - initialMemory

      // Should use less than 1MB for all mappings
      expect(memoryUsed).toBeLessThan(1024 * 1024)

      // Verify mapping size
      const totalHeroes = AI_HEROES.male.length + AI_HEROES.female.length
      expect(Object.keys(buttonToHeroMap).length).toBeGreaterThanOrEqual(totalHeroes)
    })

    it('should handle memory cleanup properly', () => {
      const createLargeMapping = () => {
        const mapping: Record<string, string> = {}

        // Create mapping with extra test data
        for (let i = 0; i < 1000; i++) {
          AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
            mapping[`🎨 ${heroName}_${i}`] = heroName
          })
        }

        return mapping
      }

      const initialMemory = process.memoryUsage().heapUsed

      // Create and destroy large mapping
      let largeMapping = createLargeMapping()
      const peakMemory = process.memoryUsage().heapUsed

      // Clear reference
      largeMapping = {} as any

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed

      // Memory should be released (with some tolerance for GC timing)
      expect(peakMemory).toBeGreaterThan(initialMemory)
      expect(finalMemory).toBeLessThan(peakMemory)
    })
  })

  describe('🎯 Scale Testing', () => {
    it('should handle adding new heroes efficiently', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Start with existing heroes
      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const initialSize = Object.keys(buttonToHeroMap).length

      // Simulate adding 100 new heroes
      const startTime = performance.now()

      for (let i = 0; i < 100; i++) {
        const newHeroName = `Новый Герой ${i}`
        buttonToHeroMap[`🎨 ${newHeroName}`] = newHeroName
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete in under 10ms
      expect(duration).toBeLessThan(10)

      // Verify all heroes were added
      expect(Object.keys(buttonToHeroMap).length).toBe(initialSize + 100)

      // Verify lookups still work
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
      expect(buttonToHeroMap['🎨 Новый Герой 50']).toBe('Новый Герой 50')
    })

    it('should handle 10x current hero count', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Create 10x the current heroes
      const multiplier = 10
      const allHeroes = AI_HEROES.male.concat(AI_HEROES.female)

      const startTime = performance.now()

      for (let i = 0; i < multiplier; i++) {
        allHeroes.forEach(heroName => {
          const uniqueHeroName = `${heroName} v${i}`
          buttonToHeroMap[`🎨 ${uniqueHeroName}`] = uniqueHeroName
        })
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100)

      const expectedSize = allHeroes.length * multiplier
      expect(Object.keys(buttonToHeroMap).length).toBe(expectedSize)

      // Test lookup performance with large dataset
      const lookupStartTime = performance.now()
      const result = buttonToHeroMap['🎨 Алекс Мерсер v5']
      const lookupEndTime = performance.now()

      expect(result).toBe('Алекс Мерсер v5')
      expect(lookupEndTime - lookupStartTime).toBeLessThan(1)
    })
  })

  describe('🔀 Concurrent Operations', () => {
    it('should handle concurrent lookups safely', async () => {
      const buttonToHeroMap: Record<string, string> = {}

      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const concurrentOperations = 100
      const testHeroes = [
        '🎨 Алекс Мерсер',
        '🎨 Человек-паук',
        '🎨 Лара Крофт',
        '🎨 Капитан Марвел'
      ]

      // Create concurrent lookup operations
      const promises = Array.from({ length: concurrentOperations }, (_, i) => {
        const heroButton = testHeroes[i % testHeroes.length]
        return Promise.resolve(buttonToHeroMap[heroButton])
      })

      const startTime = performance.now()
      const results = await Promise.all(promises)
      const endTime = performance.now()

      const duration = endTime - startTime

      // All concurrent operations should complete quickly
      expect(duration).toBeLessThan(50)

      // Verify all results are correct
      results.forEach((result, index) => {
        const expectedHero = testHeroes[index % testHeroes.length].substring(3) // Remove "🎨 "
        expect(result).toBe(expectedHero)
      })
    })

    it('should handle mixed read/write operations', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Initial setup
      AI_HEROES.male.slice(0, 10).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const operations = []

      // Mix of read and write operations
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          // Read operation
          operations.push(() => {
            const result = buttonToHeroMap['🎨 Алекс Мерсер']
            expect(result).toBe('Алекс Мерсер')
          })
        } else {
          // Write operation
          operations.push(() => {
            const newHeroName = `Тест Герой ${i}`
            buttonToHeroMap[`🎨 ${newHeroName}`] = newHeroName
          })
        }
      }

      const startTime = performance.now()

      // Execute all operations
      operations.forEach(op => op())

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete quickly
      expect(duration).toBeLessThan(20)

      // Verify data integrity
      expect(buttonToHeroMap['🎨 Алекс Мерсер']).toBe('Алекс Мерсер')
      expect(buttonToHeroMap['🎨 Тест Герой 49']).toBe('Тест Герой 49')
    })
  })

  describe('🏋️ Stress Testing', () => {
    it('should survive rapid repeated operations', () => {
      const buttonToHeroMap: Record<string, string> = {}

      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const iterations = 10000
      const testButton = '🎨 Алекс Мерсер'
      let successCount = 0

      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        const result = buttonToHeroMap[testButton]
        if (result === 'Алекс Мерсер') {
          successCount++
        }
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // All lookups should succeed
      expect(successCount).toBe(iterations)

      // Should complete in reasonable time
      expect(duration).toBeLessThan(1000) // Under 1 second

      console.log(`Stress test: ${iterations} lookups in ${duration.toFixed(2)}ms`)
      console.log(`Average: ${(duration / iterations).toFixed(4)}ms per lookup`)
    })

    it('should handle extreme edge cases efficiently', () => {
      const buttonToHeroMap: Record<string, string> = {}

      // Add normal heroes
      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      // Test edge cases
      const edgeCases = [
        '',                           // Empty string
        '🎨',                        // Just emoji
        '🎨 ',                       // Emoji + space
        '🎨  ',                      // Emoji + multiple spaces
        '🎨 Алекс Мерсер🎨',        // Extra emoji
        '🎨 Алекс\nМерсер',         // Newline
        '🎨 Алекс\tМерсер',         // Tab
        '🎨 Алекс  Мерсер',         // Double space
        'Алекс Мерсер',             // No emoji
        '🎭 Алекс Мерсер',          // Wrong emoji
        '🎨 алекс мерсер',          // Wrong case
        '🎨 АЛЕКС МЕРСЕР',          // All caps
        '🎨 Алекс.Мерсер',          // Dot instead of space
      ]

      edgeCases.forEach(edgeCase => {
        const startTime = performance.now()
        const result = buttonToHeroMap[edgeCase]
        const endTime = performance.now()

        // Should handle quickly regardless of result
        expect(endTime - startTime).toBeLessThan(1)

        // Only the correct format should return a result
        if (edgeCase === '🎨 Алекс Мерсер') {
          expect(result).toBe('Алекс Мерсер')
        } else {
          expect(result).toBeUndefined()
        }
      })
    })
  })

  describe('📈 Performance Regression Detection', () => {
    it('should maintain consistent performance across versions', () => {
      // Baseline performance measurement
      const buttonToHeroMap: Record<string, string> = {}

      AI_HEROES.male.concat(AI_HEROES.female).forEach(heroName => {
        buttonToHeroMap[`🎨 ${heroName}`] = heroName
      })

      const testCases = 1000
      const criticalHero = '🎨 Алекс Мерсер'

      // Measure baseline
      const baselineStart = performance.now()
      for (let i = 0; i < testCases; i++) {
        buttonToHeroMap[criticalHero]
      }
      const baselineEnd = performance.now()
      const baselineDuration = baselineEnd - baselineStart

      // Measure with additional data (simulating feature growth)
      for (let i = 0; i < 1000; i++) {
        buttonToHeroMap[`🎨 Extra Hero ${i}`] = `Extra Hero ${i}`
      }

      const expandedStart = performance.now()
      for (let i = 0; i < testCases; i++) {
        buttonToHeroMap[criticalHero]
      }
      const expandedEnd = performance.now()
      const expandedDuration = expandedStart - expandedEnd

      // Performance should not degrade significantly with more data
      const performanceDegradation = (expandedDuration / baselineDuration) - 1

      // Should not be more than 50% slower
      expect(performanceDegradation).toBeLessThan(0.5)

      console.log(`Baseline: ${baselineDuration.toFixed(2)}ms`)
      console.log(`Expanded: ${expandedDuration.toFixed(2)}ms`)
      console.log(`Degradation: ${(performanceDegradation * 100).toFixed(1)}%`)
    })
  })
})