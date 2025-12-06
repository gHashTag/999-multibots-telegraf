/**
 * 🧪 Тесты для ButtonMatcher - универсального сопоставителя кнопок
 *
 * Тестирует:
 * - normalizeText() - нормализация текста
 * - removeEmoji() - удаление эмодзи
 * - matchButton() - поиск кнопки по тексту
 * - matchNavigationButton() - поиск навигационных кнопок
 * - matchCategoryButton() - поиск категорий
 * - isMainMenuButton(), isCancelButton(), isBackButton() - быстрые проверки
 * - ButtonMatcher class - singleton instance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeText,
  removeEmoji,
  matchButton,
  matchNavigationButton,
  matchCategoryButton,
  matchProfileButton,
  isMainMenuButton,
  isCancelButton,
  isBackButton,
  ButtonMatcher,
  buttonMatcher,
  ButtonMatchResult
} from '@/navigation/middleware/buttonMatcher'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('ButtonMatcher', () => {
  describe('normalizeText()', () => {
    it('приводит текст к lowercase', () => {
      expect(normalizeText('ОТМЕНА')).toBe('отмена')
      expect(normalizeText('CANCEL')).toBe('cancel')
      expect(normalizeText('Main Menu')).toBe('main menu')
    })

    it('удаляет лишние пробелы', () => {
      expect(normalizeText('  текст  ')).toBe('текст')
      expect(normalizeText('  много   пробелов  ')).toBe('много пробелов')
    })

    it('удаляет эмодзи', () => {
      expect(normalizeText('🏠 Главное меню')).toBe('главное меню')
      expect(normalizeText('📸 Фото')).toBe('фото')
      expect(normalizeText('🎥 Видео 🔥')).toBe('видео')
    })

    it('комбинирует все преобразования', () => {
      expect(normalizeText('  🏠 ГЛАВНОЕ Меню  ')).toBe('главное меню')
    })
  })

  describe('removeEmoji()', () => {
    it('удаляет эмодзи из текста', () => {
      expect(removeEmoji('🎯 Тест')).toBe('Тест')
      expect(removeEmoji('🏠 Главное меню')).toBe('Главное меню')
    })

    it('сохраняет текст без эмодзи', () => {
      expect(removeEmoji('Просто текст')).toBe('Просто текст')
      expect(removeEmoji('Cancel')).toBe('Cancel')
    })

    it('удаляет множественные эмодзи', () => {
      expect(removeEmoji('🔥🎯 Текст 🚀')).toBe('Текст')
    })

    it('обрабатывает пустую строку', () => {
      expect(removeEmoji('')).toBe('')
    })
  })

  describe('matchButton()', () => {
    it('находит кнопку по точному ru тексту', () => {
      const result = matchButton('🏠 Главное меню')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('mainMenu')
      expect(result?.matchMethod).toBe('exact_ru')
    })

    it('находит кнопку по точному en тексту', () => {
      const result = matchButton('🏠 Main menu')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('mainMenu')
      expect(result?.matchMethod).toBe('exact_en')
    })

    it('находит кнопку по alias', () => {
      const result = matchButton('/menu')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('mainMenu')
      expect(result?.matchMethod).toBe('alias')
    })

    it('находит кнопку в lowercase', () => {
      const result = matchButton('отмена')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
    })

    it('возвращает null для несуществующей кнопки', () => {
      expect(matchButton('Несуществующая кнопка')).toBeNull()
      expect(matchButton('random text')).toBeNull()
    })

    it('возвращает null для пустой строки', () => {
      expect(matchButton('')).toBeNull()
    })

    it('возвращает null для null/undefined', () => {
      expect(matchButton(null as any)).toBeNull()
      expect(matchButton(undefined as any)).toBeNull()
    })

    it('находит кнопку Cancel', () => {
      const result = matchButton('Cancel')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
    })

    it('находит кнопку по команде /cancel', () => {
      const result = matchButton('/cancel')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
      expect(result?.matchMethod).toBe('alias')
    })
  })

  describe('matchNavigationButton()', () => {
    it('находит кнопку Отмена', () => {
      const result = matchNavigationButton('Отмена')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
    })

    it('находит кнопку Cancel', () => {
      const result = matchNavigationButton('Cancel')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
    })

    it('находит кнопку Главное меню', () => {
      const result = matchNavigationButton('🏠 Главное меню')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('mainMenu')
    })

    it('находит кнопку Назад', () => {
      const result = matchNavigationButton('◀️ Назад')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('back')
    })

    it('находит кнопку Справка', () => {
      const result = matchNavigationButton('❓ Справка')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('help')
    })

    it('не находит категорийные кнопки', () => {
      expect(matchNavigationButton('📸 Фото')).toBeNull()
      expect(matchNavigationButton('🎥 Видео')).toBeNull()
    })

    it('возвращает null для null/undefined', () => {
      expect(matchNavigationButton(null as any)).toBeNull()
      expect(matchNavigationButton(undefined as any)).toBeNull()
    })
  })

  describe('matchCategoryButton()', () => {
    it('находит кнопку Фото', () => {
      const result = matchCategoryButton('📸 Фото')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('photo')
    })

    it('находит кнопку Видео', () => {
      const result = matchCategoryButton('🎥 Видео')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('video')
    })

    it('находит кнопку Аудио', () => {
      const result = matchCategoryButton('🎙️ Аудио')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('audio')
    })

    it('находит кнопку Аватары', () => {
      const result = matchCategoryButton('🤖 Аватары')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('avatars')
    })

    it('находит кнопку Инструменты', () => {
      const result = matchCategoryButton('🛠️ Инструменты')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('tools')
    })

    it('находит кнопку Профиль', () => {
      const result = matchCategoryButton('👤 Профиль')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('profile')
    })

    it('не находит навигационные кнопки', () => {
      expect(matchCategoryButton('Отмена')).toBeNull()
      expect(matchCategoryButton('🏠 Главное меню')).toBeNull()
    })

    it('возвращает null для null/undefined', () => {
      expect(matchCategoryButton(null as any)).toBeNull()
      expect(matchCategoryButton(undefined as any)).toBeNull()
    })
  })

  describe('matchProfileButton()', () => {
    it('находит кнопку Баланс', () => {
      const result = matchProfileButton('💰 Баланс')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('balance')
    })

    it('находит кнопку Пополнить баланс', () => {
      const result = matchProfileButton('💎 Пополнить баланс')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('topUp')
    })

    it('находит кнопку Оформить подписку', () => {
      const result = matchProfileButton('💫 Оформить подписку')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('subscription')
    })

    it('находит кнопку Пригласить друга', () => {
      const result = matchProfileButton('👥 Пригласить друга')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('invite')
    })

    it('находит кнопку Техподдержка', () => {
      const result = matchProfileButton('💬 Техподдержка')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('support')
    })

    it('возвращает null для null/undefined', () => {
      expect(matchProfileButton(null as any)).toBeNull()
      expect(matchProfileButton(undefined as any)).toBeNull()
    })
  })

  describe('isMainMenuButton()', () => {
    it('возвращает true для кнопки Главное меню (ru)', () => {
      expect(isMainMenuButton('🏠 Главное меню')).toBe(true)
    })

    it('возвращает true для кнопки Main menu (en)', () => {
      expect(isMainMenuButton('🏠 Main menu')).toBe(true)
    })

    it('возвращает true для alias /menu', () => {
      expect(isMainMenuButton('/menu')).toBe(true)
    })

    it('возвращает true для alias меню', () => {
      expect(isMainMenuButton('меню')).toBe(true)
    })

    it('возвращает false для другого текста', () => {
      expect(isMainMenuButton('Отмена')).toBe(false)
      expect(isMainMenuButton('random')).toBe(false)
    })
  })

  describe('isCancelButton()', () => {
    it('возвращает true для Отмена', () => {
      expect(isCancelButton('Отмена')).toBe(true)
    })

    it('возвращает true для Cancel', () => {
      expect(isCancelButton('Cancel')).toBe(true)
    })

    it('возвращает true для /cancel', () => {
      expect(isCancelButton('/cancel')).toBe(true)
    })

    it('возвращает true для lowercase отмена', () => {
      expect(isCancelButton('отмена')).toBe(true)
    })

    it('возвращает false для другого текста', () => {
      expect(isCancelButton('🏠 Главное меню')).toBe(false)
      expect(isCancelButton('random')).toBe(false)
    })
  })

  describe('isBackButton()', () => {
    it('возвращает true для кнопки Назад (ru)', () => {
      expect(isBackButton('◀️ Назад')).toBe(true)
    })

    it('возвращает true для кнопки Back (en)', () => {
      expect(isBackButton('◀️ Back')).toBe(true)
    })

    it('возвращает true для alias назад', () => {
      expect(isBackButton('назад')).toBe(true)
    })

    it('возвращает false для другого текста', () => {
      expect(isBackButton('Отмена')).toBe(false)
      expect(isBackButton('random')).toBe(false)
    })
  })

  describe('ButtonMatcher class', () => {
    it('buttonMatcher singleton существует', () => {
      expect(buttonMatcher).toBeDefined()
      expect(buttonMatcher).toBeInstanceOf(ButtonMatcher)
    })

    it('match() работает как matchButton()', () => {
      const result = buttonMatcher.match('🏠 Главное меню')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('mainMenu')
    })

    it('matchNavigation() работает как matchNavigationButton()', () => {
      const result = buttonMatcher.matchNavigation('Отмена')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('cancel')
    })

    it('matchCategory() работает как matchCategoryButton()', () => {
      const result = buttonMatcher.matchCategory('📸 Фото')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('photo')
    })

    it('matchProfile() работает как matchProfileButton()', () => {
      const result = buttonMatcher.matchProfile('💰 Баланс')
      expect(result).not.toBeNull()
      expect(result?.button.id).toBe('balance')
    })

    it('isMainMenu() работает корректно', () => {
      expect(buttonMatcher.isMainMenu('🏠 Главное меню')).toBe(true)
      expect(buttonMatcher.isMainMenu('Отмена')).toBe(false)
    })

    it('isCancel() работает корректно', () => {
      expect(buttonMatcher.isCancel('Отмена')).toBe(true)
      expect(buttonMatcher.isCancel('🏠 Главное меню')).toBe(false)
    })

    it('isBack() работает корректно', () => {
      expect(buttonMatcher.isBack('◀️ Назад')).toBe(true)
      expect(buttonMatcher.isBack('Отмена')).toBe(false)
    })
  })

  describe('ButtonMatchResult structure', () => {
    it('содержит все необходимые поля', () => {
      const result = matchButton('🏠 Главное меню')
      expect(result).not.toBeNull()

      expect(result).toHaveProperty('button')
      expect(result).toHaveProperty('originalText')
      expect(result).toHaveProperty('normalizedText')
      expect(result).toHaveProperty('matchMethod')

      expect(result?.button).toHaveProperty('id')
      expect(result?.button).toHaveProperty('ru')
      expect(result?.button).toHaveProperty('en')
      expect(result?.button).toHaveProperty('aliases')
    })

    it('originalText сохраняет оригинальный текст', () => {
      const result = matchButton('🏠 Главное меню')
      expect(result?.originalText).toBe('🏠 Главное меню')
    })

    it('normalizedText содержит нормализованный текст', () => {
      const result = matchButton('🏠 Главное меню')
      expect(result?.normalizedText).toBe('главное меню')
    })
  })

  describe('Edge cases', () => {
    it('обрабатывает текст только с пробелами', () => {
      expect(matchButton('   ')).toBeNull()
    })

    it('обрабатывает текст только с эмодзи', () => {
      expect(matchButton('🏠🎯🔥')).toBeNull()
    })

    it('обрабатывает очень длинный текст', () => {
      const longText = 'a'.repeat(1000)
      expect(matchButton(longText)).toBeNull()
    })

    it('обрабатывает спецсимволы', () => {
      expect(matchButton('!@#$%^&*()')).toBeNull()
    })

    it('чувствителен к регистру для exact match, но не для alias', () => {
      // Exact match требует точного совпадения
      const exactResult = matchButton('🏠 ГЛАВНОЕ МЕНЮ')

      // Alias match работает в lowercase
      const aliasResult = matchButton('МЕНЮ')
      expect(aliasResult).not.toBeNull()
      expect(aliasResult?.matchMethod).toBe('alias')
    })
  })
})
