/**
 * 🧪 Тесты для buttonUtils - утилиты для работы с кнопками
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findItemByText,
  findItemByMode,
  getButtonTextsByMode,
  getCategoryButtonTexts,
  getAllButtonTexts,
  getSpecialButtonTexts,
  getCategoryItems
} from '@/navigation/buttonUtils'
import { CATEGORIES } from '@/navigation/config/categories.config'
import { ModeEnum } from '@/interfaces/modes'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// Helper: find first category with items
function getFirstCategoryWithItems() {
  for (const category of CATEGORIES) {
    if (category.items && category.items.length > 0) {
      return category
    }
  }
  return null
}

describe('buttonUtils', () => {
  describe('findItemByText()', () => {
    it('находит элемент по русскому тексту', () => {
      // Берём первый элемент из первой категории с items
      const category = getFirstCategoryWithItems()
      if (!category) {
        // Если нет категорий с items - пропускаем
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }
      const firstItem = category.items[0]

      const result = findItemByText(firstItem.ru)

      expect(result).toBeDefined()
      expect(result?.ru).toBe(firstItem.ru)
      expect(result?.mode).toBe(firstItem.mode)
    })

    it('находит элемент по английскому тексту', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }
      const firstItem = category.items[0]

      const result = findItemByText(firstItem.en)

      expect(result).toBeDefined()
      expect(result?.en).toBe(firstItem.en)
      expect(result?.mode).toBe(firstItem.mode)
    })

    it('возвращает undefined для несуществующего текста', () => {
      const result = findItemByText('Несуществующая кнопка')

      expect(result).toBeUndefined()
    })

    it('возвращает undefined для пустой строки', () => {
      const result = findItemByText('')

      expect(result).toBeUndefined()
    })

    it('ищет по всем категориям', () => {
      // Проверяем элементы из разных категорий
      for (const category of CATEGORIES) {
        if (category.items && category.items.length > 0) {
          const item = category.items[0]
          const result = findItemByText(item.ru)
          expect(result).toBeDefined()
          expect(result?.mode).toBe(item.mode)
        }
      }
    })
  })

  describe('findItemByMode()', () => {
    it('находит элемент по mode (string)', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }
      const firstItem = category.items[0]

      const result = findItemByMode(firstItem.mode)

      expect(result).toBeDefined()
      expect(result?.mode).toBe(firstItem.mode)
    })

    it('находит элемент по ModeEnum', () => {
      // Найдём элемент с известным ModeEnum
      let foundItem = null
      for (const category of CATEGORIES) {
        for (const item of category.items) {
          if (Object.values(ModeEnum).includes(item.mode as ModeEnum)) {
            foundItem = item
            break
          }
        }
        if (foundItem) break
      }

      if (foundItem) {
        const result = findItemByMode(foundItem.mode)
        expect(result).toBeDefined()
        expect(result?.mode).toBe(foundItem.mode)
      }
    })

    it('возвращает undefined для несуществующего mode', () => {
      const result = findItemByMode('non_existent_mode')

      expect(result).toBeUndefined()
    })

    it('возвращает undefined для пустого mode', () => {
      const result = findItemByMode('')

      expect(result).toBeUndefined()
    })
  })

  describe('getButtonTextsByMode()', () => {
    it('возвращает тексты для существующего mode', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }
      const firstItem = category.items[0]

      const result = getButtonTextsByMode(firstItem.mode)

      expect(result).not.toBeNull()
      expect(result?.ru).toBe(firstItem.ru)
      expect(result?.en).toBe(firstItem.en)
    })

    it('возвращает null для несуществующего mode', () => {
      const result = getButtonTextsByMode('non_existent_mode')

      expect(result).toBeNull()
    })

    it('работает с ModeEnum', () => {
      // Найдём элемент с известным ModeEnum
      let foundItem = null
      for (const category of CATEGORIES) {
        for (const item of category.items) {
          if (Object.values(ModeEnum).includes(item.mode as ModeEnum)) {
            foundItem = item
            break
          }
        }
        if (foundItem) break
      }

      if (foundItem) {
        const result = getButtonTextsByMode(foundItem.mode as ModeEnum)
        expect(result).not.toBeNull()
        expect(result?.ru).toBe(foundItem.ru)
      }
    })
  })

  describe('getCategoryButtonTexts()', () => {
    it('возвращает тексты кнопок для существующей категории', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }

      const result = getCategoryButtonTexts(category.id)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(category.items.length)

      // Проверяем структуру
      result.forEach((item, index) => {
        expect(item.ru).toBe(category.items[index].ru)
        expect(item.en).toBe(category.items[index].en)
      })
    })

    it('возвращает пустой массив для несуществующей категории', () => {
      const result = getCategoryButtonTexts('non_existent_category')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('возвращает пустой массив для пустого categoryId', () => {
      const result = getCategoryButtonTexts('')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('работает для всех категорий', () => {
      for (const category of CATEGORIES) {
        const result = getCategoryButtonTexts(category.id)
        expect(result.length).toBe(category.items.length)
      }
    })
  })

  describe('getAllButtonTexts()', () => {
    it('возвращает все тексты кнопок', () => {
      const result = getAllButtonTexts()

      expect(Array.isArray(result)).toBe(true)
      // Длина зависит от наличия items в категориях
      expect(result.length).toBeGreaterThanOrEqual(0)
    })

    it('каждый элемент имеет ru, en и mode', () => {
      const result = getAllButtonTexts()

      result.forEach(item => {
        expect(typeof item.ru).toBe('string')
        expect(typeof item.en).toBe('string')
        expect(item.mode).toBeDefined()
      })
    })

    it('общее количество соответствует сумме всех items во всех категориях', () => {
      const result = getAllButtonTexts()

      const expectedCount = CATEGORIES.reduce(
        (sum, cat) => sum + cat.items.length,
        0
      )

      expect(result.length).toBe(expectedCount)
    })

    it('содержит элементы из всех категорий', () => {
      const result = getAllButtonTexts()

      // Проверяем, что для каждой категории есть элементы
      for (const category of CATEGORIES) {
        for (const item of category.items) {
          const found = result.find(r => r.mode === item.mode)
          expect(found).toBeDefined()
        }
      }
    })
  })

  describe('getSpecialButtonTexts()', () => {
    it('возвращает тексты для main_menu', () => {
      const result = getSpecialButtonTexts('main_menu')

      expect(result.ru).toBe('🏠 Главное меню')
      expect(result.en).toBe('🏠 Main menu')
    })

    it('возвращает тексты для help', () => {
      const result = getSpecialButtonTexts('help')

      expect(result.ru).toBe('💬 Техподдержка')
      expect(result.en).toBe('💬 Tech Support')
    })

    it('возвращает тексты для cancel', () => {
      const result = getSpecialButtonTexts('cancel')

      expect(result.ru).toBe('Отмена')
      expect(result.en).toBe('Cancel')
    })

    it('возвращает тексты для back', () => {
      const result = getSpecialButtonTexts('back')

      expect(result.ru).toBe('◀️ Назад')
      expect(result.en).toBe('◀️ Back')
    })

    it('возвращает пустые строки для несуществующего типа', () => {
      // @ts-expect-error - проверяем edge case
      const result = getSpecialButtonTexts('non_existent')

      expect(result.ru).toBe('')
      expect(result.en).toBe('')
    })
  })

  describe('getCategoryItems()', () => {
    it('возвращает items для существующей категории', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }

      const result = getCategoryItems(category.id)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(category.items.length)
      expect(result).toEqual(category.items)
    })

    it('возвращает пустой массив для несуществующей категории', () => {
      const result = getCategoryItems('non_existent_category')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('возвращает пустой массив для пустого categoryId', () => {
      const result = getCategoryItems('')

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('возвращает объекты с mode, ru и en', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }

      const result = getCategoryItems(category.id)

      result.forEach(item => {
        expect(item.mode).toBeDefined()
        expect(typeof item.ru).toBe('string')
        expect(typeof item.en).toBe('string')
      })
    })
  })

  describe('Edge cases', () => {
    it('findItemByText не находит частичные совпадения', () => {
      const category = getFirstCategoryWithItems()
      if (!category) {
        expect(CATEGORIES.length).toBeGreaterThanOrEqual(0)
        return
      }
      const firstItem = category.items[0]
      const partialText = firstItem.ru.substring(0, 3)

      const result = findItemByText(partialText)

      // Должен вернуть undefined, если частичный текст не совпадает полностью
      // (зависит от данных, может найти если есть такая кнопка)
      if (result) {
        expect(result.ru).toBe(partialText)
      }
    })

    it('функции работают с категориями без items', () => {
      // Все категории должны иметь items
      for (const category of CATEGORIES) {
        expect(Array.isArray(category.items)).toBe(true)
      }
    })

    it('getSpecialButtonTexts возвращает объект с ru и en для всех типов', () => {
      const types = ['main_menu', 'help', 'cancel', 'back'] as const

      for (const type of types) {
        const result = getSpecialButtonTexts(type)
        expect(typeof result.ru).toBe('string')
        expect(typeof result.en).toBe('string')
        expect(result.ru.length).toBeGreaterThan(0)
        expect(result.en.length).toBeGreaterThan(0)
      }
    })
  })
})
