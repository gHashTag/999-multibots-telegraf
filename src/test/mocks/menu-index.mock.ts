// Мок для src/menu/index.ts

/**
 * Создает клавиатуру для генерации изображений
 * @returns Клавиатура в формате InlineKeyboardMarkup
 */
export const createGenerateImageKeyboard = () => {
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

// Экспортируем фиктивные версии меню из других файлов
export const mainMenu = () => ({
  mainMenuKeyboard: [[]],
  inlineMenu: [[]],
})

export const imageModelMenu = {
  imageModelKeyboard: () => ({}),
}

export const videoModelMenu = {
  videoModelKeyboard: () => ({}),
}

export const startMenu = {
  startKeyboard: () => ({}),
}

export const cancelMenu = {
  cancelKeyboard: () => ({}),
}

export const getStepSelectionMenu = () => ({})
export const getStepSelectionMenuV2 = () => ({})
export const sendGenerationCancelledMessage = async () => {}
export const sendPhotoDescriptionRequest = async () => {}
export const sendGenerationErrorMessage = async () => {}
export const sendPromptImprovementFailureMessage = async () => {}
export const sendPromptImprovementMessage = async () => {}
export const sendGenericErrorMessage = async () => {}
