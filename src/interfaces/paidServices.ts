/**
 * ПЛАТНЫЕ СЕРВИСЫ - за что мы берем деньги
 * Основано на реальных данных из базы payments_v2
 */

export enum PaidServiceEnum {
  // 🖼️ ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ (простой расчет - фиксированная цена)
  NeuroPhoto = 'neuro_photo', // 10,688⭐ выручки, 747 операций
  NeuroPhotoV2 = 'neuro_photo_v2', // 0⭐ выручки, 0 операций (доступен, но не используется)
  ImageToPrompt = 'image_to_prompt', // 171⭐ выручки, 86 операций

  // 🎬 ГЕНЕРАЦИЯ ВИДЕО (сложный расчет - зависит от модели)
  KlingVideo = 'kling_video', // 5,397⭐ выручки, 78 операций
  HaiperVideo = 'haiper_video', // 2,035⭐ выручки, 53 операции
  VideoGenerationOther = 'video_generation_other', // 475⭐ выручки, 3 операции
  MinimaxVideo = 'minimax_video', // 390⭐ выручки, 1 операция

  // 🎵 АУДИО СЕРВИСЫ (простой расчет - фиксированная цена)
  TextToSpeech = 'text_to_speech', // 172⭐ выручки, 23 операции
  Voice = 'voice', // 0⭐ выручки, 0 операций (голосовой аватар)
  VoiceToText = 'voice_to_text', // 0⭐ выручки, 0 операций (голос в текст)
  LipSync = 'lip_sync', // 0⭐ выручки, 0 операций (синхронизация губ)

  // 🎬 ДОПОЛНИТЕЛЬНЫЕ ВИДЕО СЕРВИСЫ (сложный расчет)
  ImageToVideo = 'image_to_video', // 0⭐ выручки, 0 операций (изображение в видео)
  TextToVideo = 'text_to_video', // 0⭐ выручки, 0 операций (текст в видео)

  // 🎭 АВАТАРЫ (сложный расчет - зависит от количества шагов)
  DigitalAvatarBody = 'digital_avatar_body', // 1,835⭐ выручки, 8 операций
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2', // 0⭐ выручки, 0 операций (доступен, но не используется)
}

/**
 * Типы расчета стоимости для платных сервисов
 */
export enum PricingType {
  SIMPLE = 'simple', // Простой расчет - фиксированная цена
  COMPLEX = 'complex', // Сложный расчет - зависит от параметров
}

/**
 * Конфигурация платного сервиса
 */
export interface PaidServiceConfig {
  /** Название сервиса */
  name: string
  /** Тип расчета стоимости */
  pricingType: PricingType
  /** Себестоимость в USD (цена провайдера, для простого расчета) */
  baseCostUSD?: number
  /** Описание сервиса */
  description: string
  /** Категория сервиса */
  category: 'image' | 'video' | 'audio' | 'avatar'
}

/**
 * Конфигурация всех платных сервисов
 */
export const PAID_SERVICES_CONFIG: Record<PaidServiceEnum, PaidServiceConfig> =
  {
    // 🖼️ ИЗОБРАЖЕНИЯ
    [PaidServiceEnum.NeuroPhoto]: {
      name: 'Нейрофото',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.08, // Себестоимость провайдера
      description: 'Генерация изображений с помощью ИИ',
      category: 'image',
    },

    [PaidServiceEnum.NeuroPhotoV2]: {
      name: 'Нейрофото V2',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.14, // Себестоимость провайдера
      description: 'Генерация изображений с помощью ИИ (улучшенная версия)',
      category: 'image',
    },

    [PaidServiceEnum.ImageToPrompt]: {
      name: 'Изображение в промпт',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.03, // Себестоимость провайдера
      description: 'Анализ изображения и создание текстового описания',
      category: 'image',
    },

    // 🎬 ВИДЕО (сложный расчет - цена зависит от модели и длительности)
    [PaidServiceEnum.KlingVideo]: {
      name: 'Kling Video',
      pricingType: PricingType.COMPLEX,
      description:
        'Генерация видео с помощью Kling AI (цена зависит от модели)',
      category: 'video',
    },

    [PaidServiceEnum.HaiperVideo]: {
      name: 'Haiper Video',
      pricingType: PricingType.COMPLEX,
      description:
        'Генерация видео с помощью Haiper AI (цена зависит от модели)',
      category: 'video',
    },

    [PaidServiceEnum.VideoGenerationOther]: {
      name: 'Другие видео модели',
      pricingType: PricingType.COMPLEX,
      description: 'Генерация видео с помощью различных AI моделей',
      category: 'video',
    },

    [PaidServiceEnum.MinimaxVideo]: {
      name: 'Minimax Video',
      pricingType: PricingType.COMPLEX,
      description:
        'Генерация видео с помощью Minimax AI (цена зависит от модели)',
      category: 'video',
    },

    [PaidServiceEnum.ImageToVideo]: {
      name: 'Изображение в видео',
      pricingType: PricingType.COMPLEX,
      description:
        'Преобразование изображения в видео (цена зависит от модели)',
      category: 'video',
    },

    [PaidServiceEnum.TextToVideo]: {
      name: 'Текст в видео',
      pricingType: PricingType.COMPLEX,
      description:
        'Генерация видео из текстового описания (цена зависит от модели)',
      category: 'video',
    },

    // 🎵 АУДИО
    [PaidServiceEnum.TextToSpeech]: {
      name: 'Текст в речь',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.12, // Себестоимость провайдера
      description: 'Преобразование текста в речь',
      category: 'audio',
    },

    [PaidServiceEnum.Voice]: {
      name: 'Голосовой аватар',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.9, // Себестоимость провайдера
      description: 'Создание голосового аватара',
      category: 'audio',
    },

    [PaidServiceEnum.VoiceToText]: {
      name: 'Голос в текст',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.08, // Себестоимость провайдера
      description: 'Преобразование голоса в текст',
      category: 'audio',
    },

    [PaidServiceEnum.LipSync]: {
      name: 'Синхронизация губ',
      pricingType: PricingType.SIMPLE,
      baseCostUSD: 0.9, // Себестоимость провайдера
      description: 'Синхронизация губ с аудио',
      category: 'audio',
    },

    // 🎭 АВАТАРЫ (сложный расчет - цена зависит от количества шагов обучения)
    [PaidServiceEnum.DigitalAvatarBody]: {
      name: 'Цифровой аватар',
      pricingType: PricingType.COMPLEX,
      description:
        'Создание цифрового аватара (цена зависит от количества шагов обучения)',
      category: 'avatar',
    },

    [PaidServiceEnum.DigitalAvatarBodyV2]: {
      name: 'Цифровой аватар V2',
      pricingType: PricingType.COMPLEX,
      description:
        'Создание цифрового аватара V2 (улучшенная версия, цена зависит от количества шагов обучения)',
      category: 'avatar',
    },
  }

/**
 * Получить конфигурацию платного сервиса
 */
export function getPaidServiceConfig(
  service: PaidServiceEnum
): PaidServiceConfig {
  return PAID_SERVICES_CONFIG[service]
}

/**
 * Проверить является ли сервис платным
 */
export function isPaidService(service: string): service is PaidServiceEnum {
  return Object.values(PaidServiceEnum).includes(service as PaidServiceEnum)
}

/**
 * Получить все платные сервисы по категории
 */
export function getPaidServicesByCategory(
  category: 'image' | 'video' | 'audio' | 'avatar'
): PaidServiceEnum[] {
  return Object.entries(PAID_SERVICES_CONFIG)
    .filter(([_, config]) => config.category === category)
    .map(([service, _]) => service as PaidServiceEnum)
}

/**
 * Получить сервисы с простым расчетом (фиксированная цена)
 */
export function getSimplePricingServices(): PaidServiceEnum[] {
  return Object.entries(PAID_SERVICES_CONFIG)
    .filter(([_, config]) => config.pricingType === PricingType.SIMPLE)
    .map(([service, _]) => service as PaidServiceEnum)
}

/**
 * Получить сервисы со сложным расчетом (зависит от параметров)
 */
export function getComplexPricingServices(): PaidServiceEnum[] {
  return Object.entries(PAID_SERVICES_CONFIG)
    .filter(([_, config]) => config.pricingType === PricingType.COMPLEX)
    .map(([service, _]) => service as PaidServiceEnum)
}

/**
 * Рассчитать финальную цену в звездах с наценкой
 * @param baseCostUSD Себестоимость в USD
 * @param starCost Стоимость одной звезды в USD (по умолчанию 0.016)
 * @param markup Наценка (по умолчанию 1.5 = 50%)
 * @returns Финальная цена в звездах
 */
export function calculateFinalPriceInStars(
  baseCostUSD: number,
  starCost: number = 0.016,
  markup: number = 1.5
): number {
  // 1. Переводим себестоимость в звезды
  const basePriceInStars = baseCostUSD / starCost

  // 2. Применяем наценку
  const finalPriceWithMarkup = basePriceInStars * markup

  // 3. Округляем вниз до целого числа звезд
  return Math.floor(finalPriceWithMarkup)
}
