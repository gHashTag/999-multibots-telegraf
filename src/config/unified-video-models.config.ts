/**
 * 🎯 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для всех видео-моделей
 *
 * Этот файл является единственным местом определения:
 * - Списка доступных видео-моделей
 * - Цен и ценообразования
 * - Настроек провайдеров (Kie.ai, Replicate)
 * - Поддерживаемых входных типов (text, image, morph)
 *
 * ❌ НЕ ДУБЛИРОВАТЬ эти данные в других файлах!
 * ✅ Используйте импорт из этого файла везде
 */

import { z } from 'zod'
import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
  usdToStars,
  calculateVideoPriceInStars,
} from '@/price/constants'

/**
 * Тип провайдера для генерации видео
 */
export type VideoProvider = 'kie' | 'replicate'

/**
 * Тип входных данных для модели
 */
export type VideoInputType = 'text' | 'image' | 'morph'

/**
 * Полная конфигурация видео-модели
 */
export interface UnifiedVideoModelConfig {
  // Основная информация
  id: string
  name: string
  nameRu: string
  description: string

  // Провайдер и API
  provider: VideoProvider
  apiModel: string // Название модели в API провайдера

  // Поддерживаемые входные типы
  inputTypes: VideoInputType[]

  // Ценообразование
  pricing: {
    type:
      | 'fixed'
      | 'per_second'
      | 'per_resolution'
      | 'per_duration'
      | 'per_duration_resolution'

    // Для fixed: фиксированная цена в звездах
    fixedPriceStars?: number

    // Для per_second: цена за секунду в USD
    pricePerSecondUSD?: number

    // Для per_resolution: цены по разрешениям
    priceByResolution?: Record<string, number> // в звездах

    // Для per_duration: цены по длительностям
    priceByDuration?: Record<number, number> // в звездах

    // Для per_duration_resolution: матрица цен (длительность -> разрешение -> цена)
    priceMatrix?: Record<string, Record<string, number>> // в звездах

    // Длительность по умолчанию (для динамических моделей)
    defaultDuration?: number
  }

  // Настройки API
  apiSettings: {
    // Ключ для изображения в API
    imageKey?: string

    // Поддержка морфинга
    canMorph?: boolean

    // Поддерживаемые соотношения сторон
    aspectRatios?: string[]

    // Поддерживаемые разрешения
    resolutions?: string[]

    // Поддерживаемые длительности (в секундах)
    durations?: number[]

    // Максимальная длительность
    maxDuration?: number

    // Базовые параметры для API
    baseInput?: Record<string, any>

    // Поддержка расширения промпта через LLM (WAN 2.5)
    supportsPromptExpansion?: boolean

    // Поддержка негативного промпта (WAN 2.5)
    supportsNegativePrompt?: boolean
  }

  // Статус модели
  status: 'active' | 'deprecated' | 'broken'

  // Заметки и комментарии
  notes?: string
}

/**
 * 🎯 ЕДИНЫЙ РЕЕСТР ВСЕХ ВИДЕО-МОДЕЛЕЙ
 *
 * Все модели определены здесь с полной конфигурацией
 */
export const UNIFIED_VIDEO_MODELS: Record<string, UnifiedVideoModelConfig> = {
  // ==================== KIE.AI MODELS ====================

  veo3_fast: {
    id: 'veo3_fast',
    name: 'Veo 3 Fast',
    nameRu: 'Veo 3 Fast',
    description: 'Google Veo 3 Fast - быстрая генерация видео',
    provider: 'kie',
    apiModel: 'veo3_fast',
    inputTypes: ['text', 'image', 'morph'], // ✅ Добавлена поддержка морфинга
    pricing: {
      type: 'fixed',
      fixedPriceStars: 25, // ✅ Kie.ai 2025: $0.40 / $0.016 = 25⭐ (БЕЗ наценки)
      defaultDuration: 8,
    },
    apiSettings: {
      imageKey: 'imageUrl',
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [8],
    },
    status: 'active',
  },

  veo3: {
    id: 'veo3',
    name: 'Veo 3',
    nameRu: 'Veo 3',
    description: 'Google Veo 3 - премиум качество видео',
    provider: 'kie',
    apiModel: 'veo3',
    inputTypes: ['text'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 125, // ✅ Kie.ai 2025: $2.00 / $0.016 = 125⭐ (БЕЗ наценки)
      defaultDuration: 8,
    },
    apiSettings: {
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [8],
    },
    status: 'active',
  },

  'runway-aleph': {
    id: 'runway-aleph',
    name: 'Runway Aleph',
    nameRu: 'Runway Aleph',
    description: 'Runway Gen-3 Aleph - высококачественная генерация',
    provider: 'kie',
    apiModel: 'runway-aleph',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.485, // $0.485/сек
      defaultDuration: 6,
      // Примерная цена: 6 сек × $0.485 × 1.5 / $0.016 = 182⭐
    },
    apiSettings: {
      imageKey: 'imageUrl',
      aspectRatios: ['16:9', '9:16', '1:1'],
      durations: [5, 6, 10],
      maxDuration: 10,
    },
    status: 'active',
  },

  'sora-2': {
    id: 'sora-2',
    name: 'Sora 2',
    nameRu: 'Sora 2',
    description: 'OpenAI Sora 2 - революционная генерация видео',
    provider: 'kie',
    apiModel: 'sora-2',
    inputTypes: ['text'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 9, // ✅ Kie.ai 2025: $0.15 / $0.016 = 9⭐ (10 сек БЕЗ watermark)
      defaultDuration: 10,
    },
    apiSettings: {
      aspectRatios: ['16:9', '9:16'],
      durations: [10],
    },
    status: 'active',
  },

  'sora-2-pro': {
    id: 'sora-2-pro',
    name: 'Sora 2 Pro',
    nameRu: 'Sora 2 Pro',
    description: 'OpenAI Sora 2 Pro - премиум генерация видео',
    provider: 'kie',
    apiModel: 'sora-2-pro',
    inputTypes: ['text'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 19, // ✅ Оценка: ~$0.30 / $0.016 = 19⭐ (10 сек, Pro версия)
      defaultDuration: 10,
    },
    apiSettings: {
      aspectRatios: ['16:9', '9:16'],
      durations: [10],
    },
    status: 'active',
  },

  'sora-2-i2v': {
    id: 'sora-2-i2v',
    name: 'Sora 2 I2V',
    nameRu: 'Sora 2 Изображение в видео',
    description: 'OpenAI Sora 2 Image-to-Video',
    provider: 'kie',
    apiModel: 'sora-2-i2v',
    inputTypes: ['image', 'morph'], // ✅ Добавлена поддержка морфинга
    pricing: {
      type: 'fixed',
      fixedPriceStars: 9, // ✅ Kie.ai 2025: $0.15 / $0.016 = 9⭐ (10 сек БЕЗ watermark)
      defaultDuration: 10,
    },
    apiSettings: {
      imageKey: 'imageUrl',
      aspectRatios: ['16:9', '9:16'],
      durations: [10],
    },
    status: 'active',
  },

  'sora-2-pro-i2v': {
    id: 'sora-2-pro-i2v',
    name: 'Sora 2 Pro I2V',
    nameRu: 'Sora 2 Pro Изображение в видео',
    description: 'OpenAI Sora 2 Pro Image-to-Video',
    provider: 'kie',
    apiModel: 'sora-2-pro-i2v',
    inputTypes: ['image', 'morph'], // ✅ Добавлена поддержка морфинга
    pricing: {
      type: 'fixed',
      fixedPriceStars: 19, // ✅ Оценка: ~$0.30 / $0.016 = 19⭐ (10 сек, Pro версия)
      defaultDuration: 10,
    },
    apiSettings: {
      imageKey: 'imageUrl',
      aspectRatios: ['16:9', '9:16'],
      durations: [10],
    },
    status: 'active',
  },

  // ==================== REPLICATE MODELS ====================

  'kling-v1.6-pro': {
    id: 'kling-v1.6-pro',
    name: 'Kling v1.6 Pro',
    nameRu: 'Kling v1.6 Pro',
    description: 'Kling Pro - профессиональная анимация изображений',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v1.6-pro',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 9, // Согласно videoModels.ts
    },
    apiSettings: {
      imageKey: 'start_image',
      canMorph: true,
      aspectRatios: ['16:9', '9:16'],
      baseInput: {
        prompt_optimizer: true,
        cfg_scale: 0.5,
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'ray-v2': {
    id: 'ray-v2',
    name: 'Ray-v2',
    nameRu: 'Ray-v2',
    description: 'Luma Ray v2 - детальная анимация',
    provider: 'replicate',
    apiModel: 'luma/ray-2-720p',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 16,
    },
    apiSettings: {
      imageKey: 'start_image_url',
      aspectRatios: ['16:9', '9:16'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'haiper-video-2': {
    id: 'haiper-video-2',
    name: 'Haiper Video 2',
    nameRu: 'Haiper Video 2',
    description: 'Haiper AI - высокое качество, 6 секунд',
    provider: 'replicate',
    apiModel: 'haiper-ai/haiper-video-2',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'fixed',
      // Рассчитываем из basePrice: $0.05 × 1.5 / $0.016 = 4.7⭐ ≈ 5⭐
      fixedPriceStars: 5,
    },
    apiSettings: {
      imageKey: 'frame_image_url',
      aspectRatios: ['16:9', '9:16'],
      baseInput: {
        duration: 6,
        use_prompt_enhancer: true,
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'kling-v1.6-standard': {
    id: 'kling-v1.6-standard',
    name: 'Kling v1.6 Standard',
    nameRu: 'Kling v1.6 Standard',
    description: 'Kling Standard - стандартная анимация с морфингом',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v1.6-standard',
    inputTypes: ['image', 'morph'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.056,
      defaultDuration: 5,
    },
    apiSettings: {
      imageKey: 'start_image',
      canMorph: true,
      aspectRatios: ['16:9', '9:16'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'kling-v2.0': {
    id: 'kling-v2.0',
    name: 'Kling v2.0',
    nameRu: 'Kling v2.0',
    description: 'Kling v2.0 - новейшая модель (без морфинга)',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v2.0',
    inputTypes: ['image'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.28,
      defaultDuration: 5,
    },
    apiSettings: {
      imageKey: 'start_image',
      canMorph: false,
      aspectRatios: ['16:9', '9:16'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'kling-v2.1-standard': {
    id: 'kling-v2.1-standard',
    name: 'Kling v2.1 Standard',
    nameRu: 'Kling v2.1 Standard',
    description: 'Kling v2.1 Standard 720p - улучшенная анимация',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v2.1',
    inputTypes: ['image', 'morph'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.05,
      defaultDuration: 5,
    },
    apiSettings: {
      imageKey: 'start_image',
      canMorph: true,
      aspectRatios: ['16:9', '9:16'],
      baseInput: {
        model_variant: 'standard',
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'kling-v2.1-pro': {
    id: 'kling-v2.1-pro',
    name: 'Kling v2.1 Pro',
    nameRu: 'Kling v2.1 Pro',
    description: 'Kling v2.1 Pro 1080p - премиум анимация',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v2.1',
    inputTypes: ['image', 'morph'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.09,
      defaultDuration: 5,
    },
    apiSettings: {
      imageKey: 'start_image',
      canMorph: true,
      aspectRatios: ['16:9', '9:16'],
      baseInput: {
        model_variant: 'pro',
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'seedance-1-pro': {
    id: 'seedance-1-pro',
    name: 'Seedance Pro',
    nameRu: 'Seedance Pro',
    description: 'ByteDance Seedance Pro - выбор разрешения 480p/1080p',
    provider: 'replicate',
    apiModel: 'bytedance/seedance-1-pro',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_resolution',
      priceByResolution: {
        '480p': 3, // $0.03 × 1.5 / $0.016 = 2.8⭐ ≈ 3⭐
        '1080p': 14, // $0.15 × 1.5 / $0.016 = 14⭐
      },
    },
    apiSettings: {
      imageKey: 'image',
      canMorph: false,
      resolutions: ['480p', '1080p'],
      aspectRatios: ['16:9', '9:16'],
      baseInput: {
        duration: 5,
        fps: 24,
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  // ==================== WAN 2.5 (Alibaba via Kie.ai) ====================

  // WAN 2.5 T2V - Text to Video через Kie.ai API
  'wan-2.5-t2v': {
    id: 'wan-2.5-t2v',
    name: 'WAN 2.5 T2V',
    nameRu: 'WAN 2.5 T2V',
    description:
      'Cinematic AI video generation from text with native audio sync',
    provider: 'kie',
    apiModel: 'wan/2-5-text-to-video',
    inputTypes: ['text'],
    pricing: {
      type: 'per_duration_resolution',
      // 12 credits/sec для 720p = ~60 credits за 5 сек
      // 20 credits/sec для 1080p = ~100 credits за 5 сек
      // Конвертация: 1 credit ≈ $0.005, 1 Star = $0.016
      // 720p 5 сек: 60 credits × $0.005 / $0.016 ≈ 19⭐
      // 1080p 5 сек: 100 credits × $0.005 / $0.016 ≈ 31⭐
      priceMatrix: {
        '5': { '720p': 19, '1080p': 31 },
        '10': { '720p': 38, '1080p': 62 },
      },
    },
    apiSettings: {
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9'], // ⚠️ WAN API НЕ поддерживает aspect_ratio - только 16:9
      durations: [5, 10],
      supportsPromptExpansion: true,
      supportsNegativePrompt: true,
    },
    status: 'active',
  },

  // WAN 2.5 I2V - Image to Video через Kie.ai API
  'wan-2.5-i2v': {
    id: 'wan-2.5-i2v',
    name: 'WAN 2.5 I2V',
    nameRu: 'WAN 2.5 I2V',
    description:
      'Cinematic AI video generation from image with native audio sync',
    provider: 'kie',
    apiModel: 'wan/2-5-image-to-video',
    inputTypes: ['image'],
    pricing: {
      type: 'per_duration_resolution',
      priceMatrix: {
        '5': { '720p': 19, '1080p': 31 },
        '10': { '720p': 38, '1080p': 62 },
      },
    },
    apiSettings: {
      imageKey: 'image_url',
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9'], // ⚠️ WAN API НЕ поддерживает aspect_ratio - только 16:9
      durations: [5, 10],
      supportsPromptExpansion: true,
      supportsNegativePrompt: true,
    },
    status: 'active',
  },

  // Kling 2.5 Turbo Pro - самая новая версия Kling
  'kling-v2.5-turbo-pro': {
    id: 'kling-v2.5-turbo-pro',
    name: 'Kling v2.5 Turbo Pro',
    nameRu: 'Kling v2.5 Turbo Pro',
    description:
      'Kling 2.5 Turbo Pro - премиум генерация с улучшенным качеством',
    provider: 'replicate',
    apiModel: 'kwaivgi/kling-v2.5-turbo-pro',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.098, // $0.098/сек согласно Replicate
      defaultDuration: 10,
    },
    apiSettings: {
      imageKey: 'start_image',
      aspectRatios: ['16:9', '9:16'],
      durations: [5, 10],
      baseInput: {
        prompt_optimizer: true,
      },
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  // Hailuo 2.3 - замена старого Minimax
  'hailuo-2.3': {
    id: 'hailuo-2.3',
    name: 'Hailuo 2.3',
    nameRu: 'Hailuo 2.3',
    description:
      'Minimax Hailuo 2.3 - генерация 6s/10s видео в высоком качестве',
    provider: 'replicate',
    apiModel: 'minimax/hailuo-2.3',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_duration',
      priceByDuration: {
        6: 18, // Примерная цена для 6 сек
        10: 28, // Примерная цена для 10 сек
      },
      defaultDuration: 6,
    },
    apiSettings: {
      imageKey: 'image',
      aspectRatios: ['16:9', '9:16'],
      durations: [6, 10],
      resolutions: ['512p', '768p', '1080p'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  'hailuo-2.3-fast': {
    id: 'hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    nameRu: 'Hailuo 2.3 Fast',
    description: 'Minimax Hailuo 2.3 Fast - быстрая генерация видео',
    provider: 'replicate',
    apiModel: 'minimax/hailuo-2.3-fast',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_duration',
      priceByDuration: {
        6: 12, // Примерная цена для 6 сек (дешевле чем обычная версия)
        10: 18, // Примерная цена для 10 сек
      },
      defaultDuration: 6,
    },
    apiSettings: {
      imageKey: 'image',
      aspectRatios: ['16:9', '9:16'],
      durations: [6, 10],
      resolutions: ['512p'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  // Google Veo 3.1 - ТОЛЬКО если дешевле чем Kie.ai
  // НА KIE.AI: veo3 = $2.00 за 8 сек = 187⭐
  // НА REPLICATE: veo3 = $0.75/сек × 8 = $6.00 = 562⭐
  // ❌ ВЫВОД: Replicate в 3 раза дороже! Используем ТОЛЬКО Kie.ai для Veo
  'veo-3.1': {
    id: 'veo-3.1',
    name: 'Veo 3.1 (Replicate)',
    nameRu: 'Veo 3.1 (Replicate)',
    description: 'Google Veo 3.1 через Replicate (дороже Kie.ai!)',
    provider: 'replicate',
    apiModel: 'google/veo-3.1',
    inputTypes: ['text'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.75, // $0.75/сек = очень дорого!
      defaultDuration: 8,
    },
    apiSettings: {
      aspectRatios: ['16:9', '9:16'],
      durations: [8],
    },
    status: 'deprecated', // ❌ НЕ использовать - дорого! Используйте Kie.ai
    notes:
      '⚠️ В 3 раза дороже чем через Kie.ai! Используйте veo3 через Kie.ai вместо этой модели',
  },

  'veo-3.1-fast': {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast (Replicate)',
    nameRu: 'Veo 3.1 Fast (Replicate)',
    description: 'Google Veo 3.1 Fast через Replicate (дороже Kie.ai!)',
    provider: 'replicate',
    apiModel: 'google/veo-3.1-fast',
    inputTypes: ['text'],
    pricing: {
      type: 'per_second',
      pricePerSecondUSD: 0.75,
      defaultDuration: 8,
    },
    apiSettings: {
      aspectRatios: ['16:9', '9:16'],
      durations: [8],
    },
    status: 'deprecated', // ❌ НЕ использовать - дорого! Используйте Kie.ai
    notes:
      '⚠️ В 3 раза дороже чем через Kie.ai! Используйте veo3_fast через Kie.ai вместо этой модели',
  },

  // Seedance Pro Fast
  'seedance-1-pro-fast': {
    id: 'seedance-1-pro-fast',
    name: 'Seedance Pro Fast',
    nameRu: 'Seedance Pro Fast',
    description: 'ByteDance Seedance Pro Fast - быстрая генерация',
    provider: 'replicate',
    apiModel: 'bytedance/seedance-1-pro-fast',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'per_resolution',
      priceByResolution: {
        '480p': 2, // Быстрая версия дешевле
        '1080p': 9,
      },
    },
    apiSettings: {
      imageKey: 'image',
      resolutions: ['480p', '1080p'],
      aspectRatios: ['16:9', '9:16'],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },

  // PixVerse V5
  'pixverse-v5': {
    id: 'pixverse-v5',
    name: 'PixVerse V5',
    nameRu: 'PixVerse V5',
    description: 'PixVerse V5 - новая модель генерации видео',
    provider: 'replicate',
    apiModel: 'pixverse/pixverse-v5',
    inputTypes: ['text', 'image'],
    pricing: {
      type: 'fixed',
      fixedPriceStars: 15, // Примерная цена
    },
    apiSettings: {
      imageKey: 'image',
      aspectRatios: ['16:9', '9:16'],
      durations: [4, 8],
    },
    status: 'deprecated' // ❌ ОТКЛЮЧЕНО: используй Kie.ai вместо Replicate,
  },
}

/**
 * Список всех ID моделей для type checking
 */
export type UnifiedVideoModelId = keyof typeof UNIFIED_VIDEO_MODELS

/**
 * Получить конфигурацию модели по ID
 */
export function getUnifiedModelConfig(
  modelId: string
): UnifiedVideoModelConfig | undefined {
  return UNIFIED_VIDEO_MODELS[modelId]
}

/**
 * Получить цену модели в звездах
 */
export function getUnifiedModelPrice(
  modelId: string,
  options?: {
    duration?: number
    resolution?: string
  }
): number {
  const model = UNIFIED_VIDEO_MODELS[modelId]
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`)
  }

  switch (model.pricing.type) {
    case 'fixed':
      return model.pricing.fixedPriceStars!

    case 'per_second':
      const duration = options?.duration || model.pricing.defaultDuration || 5
      const priceUSD = model.pricing.pricePerSecondUSD! * duration
      return Math.round((priceUSD * MARKUP_MULTIPLIER) / STAR_COST_USD)

    case 'per_resolution':
      const resolution =
        options?.resolution ||
        model.apiSettings.resolutions?.[0] || // Use first supported resolution as default
        '720p'
      return model.pricing.priceByResolution![resolution] || 0

    case 'per_duration':
      const dur = options?.duration || model.pricing.defaultDuration || 5
      return model.pricing.priceByDuration![dur] || 0

    case 'per_duration_resolution': {
      // WAN 2.5: цена зависит от длительности И разрешения
      const dur = String(options?.duration || 5)
      const res = options?.resolution || '720p'
      const priceMatrix = model.pricing.priceMatrix

      if (priceMatrix && priceMatrix[dur] && priceMatrix[dur][res]) {
        return priceMatrix[dur][res]
      }

      // Fallback на первую доступную цену
      const firstDuration = Object.keys(priceMatrix || {})[0]
      const firstResolution = Object.keys(priceMatrix?.[firstDuration] || {})[0]
      return priceMatrix?.[firstDuration]?.[firstResolution] || 19
    }

    default:
      throw new Error(`Unknown pricing type for model: ${modelId}`)
  }
}

/**
 * Получить модели по типу входных данных
 */
export function getModelsByInputType(
  inputType: VideoInputType
): UnifiedVideoModelConfig[] {
  return Object.values(UNIFIED_VIDEO_MODELS).filter(
    model => model.status === 'active' && model.inputTypes.includes(inputType)
  )
}

/**
 * Получить модели по провайдеру
 */
export function getModelsByProvider(
  provider: VideoProvider
): UnifiedVideoModelConfig[] {
  return Object.values(UNIFIED_VIDEO_MODELS).filter(
    model => model.status === 'active' && model.provider === provider
  )
}

/**
 * Получить только активные модели
 */
export function getActiveModels(): UnifiedVideoModelConfig[] {
  return Object.values(UNIFIED_VIDEO_MODELS).filter(
    model => model.status === 'active'
  )
}

// ============================================
// ZOD СХЕМЫ ВАЛИДАЦИИ
// ============================================

const VideoProviderSchema = z.enum(['kie', 'replicate'])
const VideoInputTypeSchema = z.enum(['text', 'image', 'morph'])
const VideoStatusSchema = z.enum(['active', 'deprecated', 'broken'])

const PricingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('fixed'),
    fixedPriceStars: z.number().positive(),
    defaultDuration: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('per_second'),
    pricePerSecondUSD: z.number().positive(),
    defaultDuration: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('per_resolution'),
    priceByResolution: z.record(z.string(), z.number().positive()),
  }),
  z.object({
    type: z.literal('per_duration'),
    priceByDuration: z.record(
      z.union([z.string(), z.number()]),
      z.number().positive()
    ), // Ключи могут быть строками или числами
    defaultDuration: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('per_duration_resolution'),
    priceMatrix: z.record(
      z.string(),
      z.record(z.string(), z.number().positive())
    ), // duration -> resolution -> price
  }),
])

const ApiSettingsSchema = z.object({
  imageKey: z.string().optional(),
  canMorph: z.boolean().optional(),
  aspectRatios: z.array(z.string()).optional(),
  resolutions: z.array(z.string()).optional(),
  durations: z.array(z.number().positive()).optional(),
  maxDuration: z.number().positive().optional(),
  baseInput: z.record(z.string(), z.any()).optional(),
  supportsPromptExpansion: z.boolean().optional(),
  supportsNegativePrompt: z.boolean().optional(),
})

export const UnifiedVideoModelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameRu: z.string().min(1),
  description: z.string().min(1),
  provider: VideoProviderSchema,
  apiModel: z.string().min(1),
  inputTypes: z.array(VideoInputTypeSchema).min(1),
  pricing: PricingSchema,
  apiSettings: ApiSettingsSchema,
  status: VideoStatusSchema,
  notes: z.string().optional(),
})

/**
 * Валидация конфигурации моделей
 */
export function validateVideoModels(): void {
  const errors: string[] = []

  Object.entries(UNIFIED_VIDEO_MODELS).forEach(([modelId, config]) => {
    try {
      UnifiedVideoModelConfigSchema.parse(config)
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(
          `Model "${modelId}": ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        )
      }
    }
  })

  if (errors.length > 0) {
    throw new Error(`Video models validation failed:\n${errors.join('\n')}`)
  }
  // Video models validated successfully
}

// Валидируем при загрузке модуля
try {
  validateVideoModels()
} catch (error) {
  console.error('❌ Video models validation failed:', error)
  throw error
}

// ============================================
// 🎨 ЦЕНТРАЛИЗОВАННЫЕ ФУНКЦИИ ГЕНЕРАЦИИ UI
// ============================================

/**
 * Zod схема для валидации параметров генерации кнопки
 */
const GenerateButtonParamsSchema = z.object({
  modelId: z.string().min(1, 'modelId cannot be empty'),
  aspectRatio: z.enum(['16:9', '9:16'], {
    errorMap: () => ({ message: 'aspectRatio must be "16:9" or "9:16"' }),
  }),
  isRu: z.boolean(),
})

/**
 * Zod схема для результата парсинга кнопки
 */
export const ParsedModelButtonSchema = z.object({
  modelId: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16']),
  duration: z.number().positive().optional(),
  cost: z.number().nonnegative(),
  resolution: z.string().optional(),
})

/**
 * Интерфейс для результата парсинга кнопки
 */
export type ParsedModelButton = z.infer<typeof ParsedModelButtonSchema>

/**
 * Zod схема для параметров generateModelKeyboard
 */
const GenerateKeyboardParamsSchema = z.object({
  inputType: z.enum(['text', 'image', 'morph']),
  isRu: z.boolean(),
  supportedModels: z.array(z.string()).optional(),
})

/**
 * 🎯 ЕДИНАЯ функция создания кнопки для модели
 * Используется ВЕЗДЕ: wizards, keyboards, handlers
 *
 * @param modelId - ID модели из UNIFIED_VIDEO_MODELS
 * @param aspectRatio - '16:9' или '9:16'
 * @param isRu - русский или английский язык
 * @returns Строка для кнопки в формате "Название | 8s | 🖥️ (187⭐)"
 * @throws {z.ZodError} Если параметры не валидны
 */
export function generateModelButton(
  modelId: string,
  aspectRatio: '16:9' | '9:16',
  isRu: boolean
): string {
  // ✅ ZOD ВАЛИДАЦИЯ ВХОДНЫХ ПАРАМЕТРОВ
  const validated = GenerateButtonParamsSchema.parse({
    modelId,
    aspectRatio,
    isRu,
  })

  const config = getUnifiedModelConfig(validated.modelId)
  if (!config) {
    throw new Error(
      `[generateModelButton] Model not found: ${validated.modelId}`
    )
  }

  const aspectIcon = validated.aspectRatio === '9:16' ? '📱' : '🖥️'

  // Расчет цены с учетом разрешения для per_resolution моделей
  const resolution = validated.aspectRatio === '9:16' ? '480p' : '1080p'
  const stars = getUnifiedModelPrice(validated.modelId, { resolution })

  // Определяем длительность из конфига
  let durationText = ''
  if (config.pricing.type === 'fixed' && config.pricing.defaultDuration) {
    durationText = ` | ${config.pricing.defaultDuration}s`
  } else if (
    config.pricing.type === 'per_second' &&
    config.pricing.defaultDuration
  ) {
    durationText = ` | ${config.pricing.defaultDuration}s`
  } else if (
    config.pricing.type === 'per_duration' &&
    config.pricing.defaultDuration
  ) {
    durationText = ` | ${config.pricing.defaultDuration}s`
  }

  const displayName = validated.isRu ? config.nameRu : config.name

  // Добавляем разрешение для моделей с ценой за разрешение
  const resolutionSuffix =
    config.pricing.type === 'per_resolution' ? ` ${resolution}` : ''

  return `${displayName}${resolutionSuffix}${durationText} | ${aspectIcon} (${stars}⭐)`
}

/**
 * 🎯 ЕДИНАЯ функция парсинга выбранной модели из кнопки
 * Используется ВЕЗДЕ: wizards, handlers
 *
 * @param buttonText - Текст кнопки
 * @returns Распарсенные данные модели (НЕ null - всегда fallback к veo3_fast)
 * @throws {z.ZodError} Если результат не соответствует схеме
 */
export function parseModelButton(buttonText: string): ParsedModelButton {
  console.log('[parseModelButton] Parsing button text:', buttonText)

  // Определяем соотношение сторон по иконке
  const aspectRatio: '16:9' | '9:16' = buttonText.includes('📱')
    ? '9:16'
    : '16:9'

  // Парсим по названию модели из unified config
  const allModels = getActiveModels()
  const foundModel = allModels.find(
    config =>
      buttonText.includes(config.name) || buttonText.includes(config.nameRu)
  )

  let result: ParsedModelButton

  if (foundModel) {
    const modelId = foundModel.id

    // Используем unified config для расчета цены
    const resolution = aspectRatio === '9:16' ? '480p' : '1080p'
    const stars = getUnifiedModelPrice(modelId, { resolution })

    // Определяем длительность
    let duration: number | undefined
    if (
      foundModel.pricing.type === 'fixed' &&
      foundModel.pricing.defaultDuration
    ) {
      duration = foundModel.pricing.defaultDuration
    } else if (
      foundModel.pricing.type === 'per_second' &&
      foundModel.pricing.defaultDuration
    ) {
      duration = foundModel.pricing.defaultDuration
    } else if (
      foundModel.pricing.type === 'per_duration' &&
      foundModel.pricing.defaultDuration
    ) {
      duration = foundModel.pricing.defaultDuration
    }

    result = {
      modelId,
      aspectRatio,
      duration,
      cost: stars,
      resolution,
    }
  } else {
    console.warn(
      '[parseModelButton] No match found for button text:',
      buttonText,
      '- using fallback'
    )
    // ✅ ВСЕГДА возвращаем валидный fallback вместо null
    result = {
      modelId: 'veo3_fast',
      aspectRatio,
      duration: 8,
      cost: 37,
      resolution: aspectRatio === '9:16' ? '480p' : '1080p',
    }
  }

  // ✅ ZOD ВАЛИДАЦИЯ РЕЗУЛЬТАТА
  return ParsedModelButtonSchema.parse(result)
}

/**
 * 🎯 ЕДИНАЯ функция создания клавиатуры для выбора модели
 * Используется ВЕЗДЕ: wizards, menus
 *
 * @param inputType - Тип входа: 'text', 'image', 'morph'
 * @param isRu - русский или английский язык
 * @param supportedModels - Опциональный список поддерживаемых моделей
 * @returns Массив рядов кнопок
 * @throws {z.ZodError} Если параметры не валидны
 */
export function generateModelKeyboard(
  inputType: VideoInputType,
  isRu: boolean,
  supportedModels?: string[]
): string[][] {
  // ✅ ZOD ВАЛИДАЦИЯ ВХОДНЫХ ПАРАМЕТРОВ
  const validated = GenerateKeyboardParamsSchema.parse({
    inputType,
    isRu,
    supportedModels,
  })

  // Получаем все активные модели для данного типа входа
  let models = getActiveModels().filter(config =>
    config.inputTypes.includes(validated.inputType)
  )

  // Фильтруем по списку поддерживаемых моделей, если он передан
  if (validated.supportedModels && validated.supportedModels.length > 0) {
    models = models.filter(config =>
      validated.supportedModels!.includes(config.id)
    )
  }

  if (models.length === 0) {
    throw new Error(
      `[generateModelKeyboard] No models found for inputType: ${validated.inputType}`
    )
  }

  // Создаем ряды для каждой модели: 2 кнопки (16:9 + 9:16)
  // НО только те, которые поддерживает модель!
  const keyboardRows: string[][] = []

  models.forEach(config => {
    const supportedAspectRatios = config.apiSettings.aspectRatios || ['16:9', '9:16']
    const row: string[] = []

    // Добавляем кнопку 16:9 если модель её поддерживает
    if (supportedAspectRatios.includes('16:9')) {
      row.push(generateModelButton(config.id, '16:9', validated.isRu))
    }

    // Добавляем кнопку 9:16 если модель её поддерживает
    if (supportedAspectRatios.includes('9:16')) {
      row.push(generateModelButton(config.id, '9:16', validated.isRu))
    }

    // Добавляем ряд только если есть хотя бы одна кнопка
    if (row.length > 0) {
      keyboardRows.push(row)
    }
  })

  return keyboardRows
}

// ============================================
// 🔄 BACKWARD COMPATIBILITY ALIASES
// ============================================

/**
 * Алиас для обратной совместимости
 * @deprecated Используйте UNIFIED_VIDEO_MODELS
 */
export const VIDEO_MODELS_CONFIG = UNIFIED_VIDEO_MODELS

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте getUnifiedModelPrice
 */
export function getModelPriceInStars(
  modelId: string,
  duration?: number
): number {
  return getUnifiedModelPrice(modelId, { duration })
}

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте apiSettings.durations из unified config
 */
export function isDurationSupported(
  modelId: string,
  duration: number
): boolean {
  const config = getUnifiedModelConfig(modelId)
  if (!config || !config.apiSettings.durations) {
    return true
  }
  return config.apiSettings.durations.includes(duration)
}

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте pricing.defaultDuration из unified config
 */
export function getValidDuration(
  modelId: string,
  requestedDuration?: number
): number | undefined {
  const config = getUnifiedModelConfig(modelId)
  if (!config || !config.apiSettings.durations) {
    return undefined
  }

  if (!requestedDuration) {
    return config.pricing.defaultDuration
  }

  if (config.apiSettings.durations.includes(requestedDuration)) {
    return requestedDuration
  }

  return config.pricing.defaultDuration
}

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте getModelsByInputType('text')
 */
export function getTextToVideoModels() {
  return getModelsByInputType('text')
}

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте getModelsByInputType('image')
 */
export function getImageToVideoModels() {
  return getModelsByInputType('image')
}

/**
 * Алиас для обратной совместимости с videoModels.ts
 * @deprecated Используйте generateModelButton
 */
export function formatModelInfo(
  modelId: string,
  duration?: number,
  is_ru = false
): string {
  const config = getUnifiedModelConfig(modelId)
  if (!config) return 'Unknown model'

  const name = is_ru ? config.nameRu : config.name
  const price = getUnifiedModelPrice(modelId, { duration })

  if (config.apiSettings.durations && duration) {
    return `${name} (${duration} сек) - ${price} ⭐`
  }

  return `${name} - ${price} ⭐`
}
