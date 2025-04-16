import { SubscriptionType } from '@/interfaces/subscription.interface'

export interface SubscriptionConfig {
  type: SubscriptionType
  title_ru: string
  title_en: string
  price_ru: number
  price_en: number
  description_ru: string
  description_en: string
  features_ru: string[]
  features_en: string[]
  duration_days: number
  stars: number
}

export const SUBSCRIPTION_CONFIG: Record<SubscriptionType, SubscriptionConfig> =
  {
    [SubscriptionType.STARS]: {
      type: SubscriptionType.STARS,
      title_ru: '⭐ Звезды',
      title_en: '⭐ Stars',
      price_ru: 0,
      price_en: 0,
      description_ru: 'Базовый режим со звездами',
      description_en: 'Basic mode with stars',
      features_ru: [
        '⭐ Оплата звездами',
        '🎨 Базовые функции',
        '📱 Мобильный доступ',
      ],
      features_en: [
        '⭐ Pay with stars',
        '🎨 Basic features',
        '📱 Mobile access',
      ],
      duration_days: 0,
      stars: 0,
    },
    [SubscriptionType.NEUROPHOTO]: {
      type: SubscriptionType.NEUROPHOTO,
      title_ru: '📸 Нейрофото',
      title_en: '📸 NeuroPhoto',
      price_ru: 1110,
      price_en: 14.99,
      description_ru: 'Базовая подписка для генерации изображений',
      description_en: 'Basic subscription for image generation',
      features_ru: [
        '✨ Генерация изображений',
        '🎨 Базовые стили',
        '📱 Мобильный доступ',
      ],
      features_en: [
        '✨ Image generation',
        '🎨 Basic styles',
        '📱 Mobile access',
      ],
      duration_days: 30,
      stars: 476,
    },
    [SubscriptionType.NEUROBASE]: {
      type: SubscriptionType.NEUROBASE,
      title_ru: '🌟 Нейробаза',
      title_en: '🌟 NeuroBase',
      price_ru: 2999,
      price_en: 29.99,
      description_ru: 'Расширенная подписка со всеми функциями',
      description_en: 'Advanced subscription with all features',
      features_ru: [
        '✨ Все функции Нейрофото',
        '🎨 Продвинутые стили',
        '🔄 Приоритетная обработка',
        '💫 Дополнительные опции',
      ],
      features_en: [
        '✨ All NeuroPhoto features',
        '🎨 Advanced styles',
        '🔄 Priority processing',
        '💫 Additional options',
      ],
      duration_days: 30,
      stars: 1303,
    },
    [SubscriptionType.NEUROBLOGGER]: {
      type: SubscriptionType.NEUROBLOGGER,
      title_ru: '🚀 НейроБлоггер',
      title_en: '🚀 NeuroBlogger',
      price_ru: 75000,
      price_en: 999.99,
      description_ru: 'Профессиональная подписка для блоггеров',
      description_en: 'Professional subscription for bloggers',
      features_ru: [
        '✨ Все функции Нейробазы',
        '🎬 Генерация видео',
        '🎨 Эксклюзивные стили',
        '🔥 Максимальный приоритет',
      ],
      features_en: [
        '✨ All NeuroBase features',
        '🎬 Video generation',
        '🎨 Exclusive styles',
        '🔥 Maximum priority',
      ],
      duration_days: 30,
      stars: 32608,
    },
    [SubscriptionType.NEUROTESTER]: {
      type: SubscriptionType.NEUROTESTER,
      title_ru: '🧪 НейроТестер',
      title_en: '🧪 NeuroTester',
      price_ru: 5,
      price_en: 0.99,
      description_ru: 'Тестовая подписка для ознакомления',
      description_en: 'Test subscription for trial',
      features_ru: [
        '✨ Базовые функции',
        '⏳ Ограниченный период',
        '📱 Тестовый доступ',
      ],
      features_en: ['✨ Basic features', '⏳ Limited period', '📱 Test access'],
      duration_days: 1,
      stars: 5,
    },
  }
