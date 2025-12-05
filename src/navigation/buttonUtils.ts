/**
 * 🎯 УТИЛИТЫ ДЛЯ РАБОТЫ С КНОПКАМИ
 *
 * Функции для получения текстов кнопок, поиска по mode и категориям.
 * Заменяет старый levels[] из NavigationService.ts
 */

import { ModeEnum } from '@/interfaces/modes'
import { CATEGORIES } from '@/navigation'

/**
 * Найти функцию по тексту кнопки
 */
export function findItemByText(text: string) {
  for (const category of CATEGORIES) {
    const item = category.items.find(
      item => item.ru === text || item.en === text
    )
    if (item) return item
  }
  return undefined
}

/**
 * Найти функцию по mode
 */
export function findItemByMode(
  mode: string | ModeEnum
) {
  for (const category of CATEGORIES) {
    const item = category.items.find(item => item.mode === mode)
    if (item) return item
  }
  return undefined
}

/**
 * Получить тексты кнопки по mode (для замены levels[])
 */
export function getButtonTextsByMode(
  mode: string | ModeEnum
): { ru: string; en: string } | null {
  const item = findItemByMode(mode)
  if (!item) return null
  return { ru: item.ru, en: item.en }
}

/**
 * Получить все тексты кнопок из категории
 */
export function getCategoryButtonTexts(
  categoryId: string
): Array<{ ru: string; en: string }> {
  const category = CATEGORIES.find(cat => cat.id === categoryId)
  if (!category) return []
  return category.items.map(item => ({ ru: item.ru, en: item.en }))
}

/**
 * Получить все тексты кнопок (плоский список)
 */
export function getAllButtonTexts(): Array<{
  ru: string
  en: string
  mode: string | ModeEnum
}> {
  const result: Array<{ ru: string; en: string; mode: string | ModeEnum }> = []
  for (const category of CATEGORIES) {
    for (const item of category.items) {
      result.push({ ru: item.ru, en: item.en, mode: item.mode })
    }
  }
  return result
}

/**
 * Получить тексты специальных кнопок (не в категориях)
 */
export function getSpecialButtonTexts(
  buttonType: 'main_menu' | 'help' | 'cancel' | 'back'
): { ru: string; en: string } {
  const specialButtons: Record<string, { ru: string; en: string }> = {
    main_menu: { ru: '🏠 Главное меню', en: '🏠 Main menu' },
    help: { ru: '💬 Техподдержка', en: '💬 Tech Support' },
    cancel: { ru: 'Отмена', en: 'Cancel' },
    back: { ru: '◀️ Назад', en: '◀️ Back' },
  }
  return specialButtons[buttonType] || { ru: '', en: '' }
}

/**
 * Получить все функции категории
 */
export function getCategoryItems(categoryId: string) {
  const category = CATEGORIES.find(cat => cat.id === categoryId)
  return category ? category.items : []
}
