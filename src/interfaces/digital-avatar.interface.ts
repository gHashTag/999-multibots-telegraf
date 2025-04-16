/**
 * Интерфейс модели цифрового тела
 */
export interface DigitalAvatarModel {
  /** Уникальный ключ модели */
  key: string
  
  /** Отображаемое имя модели */
  name: string
  
  /** Описание модели */
  description: string
  
  /** URL для загрузки модели */
  modelUrl: string
  
  /** URL превью изображения модели */
  previewUrl: string
  
  /** Цена в звездах (0 для бесплатных моделей) */
  price: number
  
  /** Список особенностей/возможностей модели */
  features: string[]
}

/**
 * Состояние сцены выбора цифрового тела
 */
export interface DigitalAvatarSceneState {
  /** Выбранная модель */
  selectedModel?: DigitalAvatarModel
  
  /** Текущий этап выбора */
  step: 'selecting' | 'processing'
  
  /** Флаг успешной оплаты (для платных моделей) */
  isPaid?: boolean
}

/**
 * Конфигурация для инициализации цифрового тела
 */
export interface DigitalAvatarConfig {
  /** Ключ выбранной модели */
  modelKey: string
  
  /** ID пользователя в Telegram */
  telegram_id: string
  
  /** Флаг использования русского языка */
  is_ru: boolean
  
  /** Имя бота */
  botName: string
} 