export * from './mainMenu'
export * from './imageModelMenu'
export * from './mainMenu'
export * from './imageModelMenu'
export * from './startMenu'
export * from './videoModelMenu'
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
