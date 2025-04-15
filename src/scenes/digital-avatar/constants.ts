import { DigitalAvatarModel } from '../../interfaces/digital-avatar.interface'

/**
 * Предустановленные модели цифровых тел
 */
export const DIGITAL_AVATAR_MODELS: Record<string, DigitalAvatarModel> = {
  AVATAR_1: {
    key: 'digital_avatar_1',
    name: '🤖 Цифровое тело #1',
    description: 'Базовая модель цифрового тела',
    modelUrl: 'models/digital_avatar_1:latest',
    previewUrl: 'https://storage.googleapis.com/digital-avatars/preview_1.jpg',
    price: 0, // Базовая модель бесплатна
    features: ['Базовая анимация', 'Простые жесты', 'Базовая мимика']
  },
  AVATAR_2: {
    key: 'digital_avatar_2',
    name: '🤖 Цифровое тело #2',
    description: 'Продвинутая модель цифрового тела',
    modelUrl: 'models/digital_avatar_2:latest',
    previewUrl: 'https://storage.googleapis.com/digital-avatars/preview_2.jpg',
    price: 1000, // Цена в звездах
    features: [
      'Продвинутая анимация',
      'Расширенный набор жестов',
      'Реалистичная мимика',
      'Синхронизация губ с речью'
    ]
  }
}

/**
 * Ключи для перевода
 */
export const TRANSLATION_KEYS = {
  MENU_TITLE: 'digital_avatar_menu_title',
  SELECT_MODEL: 'digital_avatar_select_model',
  MODEL_SELECTED: 'digital_avatar_model_selected',
  PRICE_INFO: 'digital_avatar_price_info',
  FREE_MODEL: 'digital_avatar_free_model',
  PREMIUM_MODEL: 'digital_avatar_premium_model'
}

/**
 * События для аналитики
 */
export const ANALYTICS_EVENTS = {
  MODEL_VIEWED: 'digital_avatar_model_viewed',
  MODEL_SELECTED: 'digital_avatar_model_selected',
  PURCHASE_INITIATED: 'digital_avatar_purchase_initiated'
}

/**
 * Состояния сцены
 */
export enum SceneState {
  SELECTING_MODEL = 'selecting_model',
  CONFIRMING_SELECTION = 'confirming_selection',
  PROCESSING_PAYMENT = 'processing_payment'
}
