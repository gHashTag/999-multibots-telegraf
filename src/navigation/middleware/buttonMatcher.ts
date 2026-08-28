/**
 * 🎯 УНИВЕРСАЛЬНЫЙ МАТЧЕР КНОПОК
 *
 * Сопоставляет текст сообщения с конфигурацией кнопок.
 * Поддерживает:
 * - Нормализацию текста (trim, lowercase)
 * - Сопоставление по ru/en тексту
 * - Сопоставление по aliases
 * - Удаление эмодзи для сравнения
 */

import {
  ButtonConfig,
  ALL_BUTTONS,
  NAVIGATION_BUTTONS,
  CATEGORY_BUTTONS,
  PROFILE_BUTTONS,
} from '../config/buttons.config'
import { logger } from '@/utils/logger'

/**
 * Результат сопоставления кнопки
 */
export interface ButtonMatchResult {
  /** Найденная кнопка */
  button: ButtonConfig
  /** Оригинальный текст */
  originalText: string
  /** Нормализованный текст */
  normalizedText: string
  /** Метод сопоставления */
  matchMethod: 'exact_ru' | 'exact_en' | 'alias' | 'normalized'
}

/**
 * Нормализует текст для сравнения
 */
export function normalizeText(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      // Удаляем эмодзи для нечёткого сравнения
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Удаляет эмодзи из текста
 */
export function removeEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()
}

/**
 * Проверяет, совпадает ли текст с кнопкой
 */
function matchesButton(
  text: string,
  button: ButtonConfig
): ButtonMatchResult | null {
  const trimmedText = text.trim()
  const lowercaseText = trimmedText.toLowerCase()
  const normalizedText = normalizeText(text)

  // 1. Точное совпадение с русским текстом
  if (trimmedText === button.ru) {
    return {
      button,
      originalText: text,
      normalizedText,
      matchMethod: 'exact_ru',
    }
  }

  // 2. Точное совпадение с английским текстом
  if (trimmedText === button.en) {
    return {
      button,
      originalText: text,
      normalizedText,
      matchMethod: 'exact_en',
    }
  }

  // 3. Совпадение с lowercase вариантами
  if (
    lowercaseText === button.ru.toLowerCase() ||
    lowercaseText === button.en.toLowerCase()
  ) {
    return {
      button,
      originalText: text,
      normalizedText,
      matchMethod: 'normalized',
    }
  }

  // 4. Совпадение с aliases
  for (const alias of button.aliases) {
    if (lowercaseText === alias.toLowerCase()) {
      return {
        button,
        originalText: text,
        normalizedText,
        matchMethod: 'alias',
      }
    }
  }

  // 5. Нечёткое совпадение (без эмодзи)
  const buttonRuNoEmoji = removeEmoji(button.ru).toLowerCase()
  const buttonEnNoEmoji = removeEmoji(button.en).toLowerCase()

  if (
    normalizedText === buttonRuNoEmoji ||
    normalizedText === buttonEnNoEmoji
  ) {
    return {
      button,
      originalText: text,
      normalizedText,
      matchMethod: 'normalized',
    }
  }

  return null
}

/**
 * Ищет кнопку по тексту среди всех кнопок
 */
export function matchButton(text: string): ButtonMatchResult | null {
  if (!text || typeof text !== 'string') {
    return null
  }

  for (const button of Object.values(ALL_BUTTONS)) {
    const result = matchesButton(text, button)
    if (result) {
      logger.debug('[ButtonMatcher] Button matched', {
        buttonId: result.button.id,
        originalText: result.originalText.substring(0, 30),
        matchMethod: result.matchMethod,
      })
      return result
    }
  }

  return null
}

/**
 * Ищет кнопку навигации (Главное меню, Назад, Отмена, Справка)
 */
export function matchNavigationButton(text: string): ButtonMatchResult | null {
  if (!text || typeof text !== 'string') {
    return null
  }

  for (const button of Object.values(NAVIGATION_BUTTONS)) {
    const result = matchesButton(text, button)
    if (result) {
      return result
    }
  }

  return null
}

/**
 * Ищет кнопку категории (Фото, Видео, Аудио, Аватары, Инструменты, Профиль)
 */
export function matchCategoryButton(text: string): ButtonMatchResult | null {
  if (!text || typeof text !== 'string') {
    return null
  }

  for (const button of Object.values(CATEGORY_BUTTONS)) {
    const result = matchesButton(text, button)
    if (result) {
      return result
    }
  }

  return null
}

/**
 * Ищет кнопку профиля (Баланс, Подписка, Пригласить друга, Техподдержка)
 */
export function matchProfileButton(text: string): ButtonMatchResult | null {
  if (!text || typeof text !== 'string') {
    return null
  }

  for (const button of Object.values(PROFILE_BUTTONS)) {
    const result = matchesButton(text, button)
    if (result) {
      return result
    }
  }

  return null
}

/**
 * Проверяет, является ли текст командой главного меню
 */
export function isMainMenuButton(text: string): boolean {
  const result = matchButton(text)
  return result?.button.id === 'mainMenu'
}

/**
 * Проверяет, является ли текст командой отмены
 */
export function isCancelButton(text: string): boolean {
  const result = matchButton(text)
  return result?.button.id === 'cancel'
}

/**
 * Проверяет, является ли текст командой назад
 */
export function isBackButton(text: string): boolean {
  const result = matchButton(text)
  return result?.button.id === 'back'
}

/**
 * Класс ButtonMatcher для использования как singleton
 */
export class ButtonMatcher {
  match(text: string): ButtonMatchResult | null {
    return matchButton(text)
  }

  matchNavigation(text: string): ButtonMatchResult | null {
    return matchNavigationButton(text)
  }

  matchCategory(text: string): ButtonMatchResult | null {
    return matchCategoryButton(text)
  }

  matchProfile(text: string): ButtonMatchResult | null {
    return matchProfileButton(text)
  }

  isMainMenu(text: string): boolean {
    return isMainMenuButton(text)
  }

  isCancel(text: string): boolean {
    return isCancelButton(text)
  }

  isBack(text: string): boolean {
    return isBackButton(text)
  }
}

// Singleton instance
export const buttonMatcher = new ButtonMatcher()
