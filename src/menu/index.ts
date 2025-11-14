/**
 * ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ - navigation/unified-navigation.config.ts
 *
 * Этот файл экспортирует навигацию и вспомогательные функции меню
 */

// ========================================
// 1. ОСНОВНАЯ НАВИГАЦИЯ (ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ)
// ========================================
// Экспортируем ВСЁ из единого конфига
export * from '../navigation/unified-navigation.config'

// ========================================
// 2. СПЕЦИАЛИЗИРОВАННЫЕ МЕНЮ
// ========================================
export * from './imageModelMenu'
export * from './videoModelMenu'

// ========================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================
export * from './startMenu'
export * from './cancelMenu'
export * from './getStepSelectionMenu'
export * from './getStepSelectionMenuV2'
export * from './sendGenerationCancelledMessage'
export * from './sendPhotoDescriptionRequest'
export * from './sendGenerationErrorMessage'
export * from './sendPromptImprovementFailureMessage'
export * from './sendPromptImprovementMessage'
export * from './sendGenericErrorMessage'
export * from './createHelpCancelKeyboard/createHelpCancelKeyboard'
export * from './cancelHelpArray'

// ========================================
// 4. INLINE КЛАВИАТУРЫ
// ========================================
import { Markup } from 'telegraf'
import type { InlineKeyboardMarkup } from 'telegraf/types'

/**
 * Создает клавиатуру для генерации изображений
 * @returns Клавиатура в формате InlineKeyboardMarkup
 */
export const createGenerateImageKeyboard = (): InlineKeyboardMarkup => {
  return {
    inline_keyboard: [
      [
        {
          text: 'Сгенерировать',
          callback_data: 'generate_image',
        },
        {
          text: 'Отмена',
          callback_data: 'cancel',
        },
      ],
    ],
  }
}
