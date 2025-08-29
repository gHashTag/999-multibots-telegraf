import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'

// models.config.ts
export type VideoModelConfig = {
  id: string
  title: string
  description: string
  inputType: ('text' | 'image' | 'morph')[]
  basePrice: number
  api: {
    model: string
    input: Record<string, any>
  }
  requirements?: {
    minBalance?: number
    maxDuration?: number
  }
  imageKey?: string
  canMorph?: boolean
  resolutionOptions?: string[]
  priceByResolution?: Record<string, number>
  durationOptions?: number[] // Поддерживаемые длительности в секундах
  priceByDuration?: Record<number, number> // Цена за каждую длительность
  aspectRatioOptions?: string[] // Поддерживаемые соотношения сторон
}

export const VIDEO_MODELS_CONFIG: Record<string, VideoModelConfig> = {
  minimax: {
    id: 'minimax',
    title: 'Minimax',
    inputType: ['text', 'image'],
    description: 'Базовая модель для начального уровня',
    basePrice: 0.5,
    api: {
      model: 'minimax/video-01',
      input: {
        prompt_optimizer: true,
      },
    },
    imageKey: 'first_frame_image',
    canMorph: false,
  },
  'haiper-video-2': {
    id: 'haiper-video-2',
    title: 'Haiper Video 2',
    description: 'Высокое качество, длительность 6 секунд',
    inputType: ['text', 'image'],
    basePrice: 0.05,
    api: {
      model: 'haiper-ai/haiper-video-2',
      input: {
        duration: 6,
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : '16:9',
        use_prompt_enhancer: true,
      },
    },
    imageKey: 'frame_image_url',
  },
  'ray-v2': {
    id: 'ray-v2',
    title: 'Ray-v2',
    description: 'Продвинутая модель для детальной анимации',
    inputType: ['text', 'image'],
    basePrice: 0.18,
    api: {
      model: 'luma/ray-2-720p',
      input: {},
    },
    imageKey: 'start_image_url',
  },
  'wan-image-to-video': {
    id: 'wan-image-to-video',
    title: 'Wan-2.1-i2v',
    inputType: ['image'],
    description: 'Базовая модель для начального уровня',
    basePrice: 0.25,
    api: {
      model: 'wavespeedai/wan-2.1-i2v-720p',
      input: {
        fast_mode: 'Balanced',
        num_frames: 81,
        sample_shift: 5,
        sample_steps: 30,
        frames_per_second: 16,
        sample_guide_scale: 5,
        max_area: '720x1280',
      },
    },
    imageKey: 'image',
  },
  'wan-text-to-video': {
    id: 'wan-text-to-video',
    title: 'Wan-2.1',
    inputType: ['text'],
    description: 'Базовая модель для начального уровня',
    basePrice: 0.25,
    api: {
      model: 'wavespeedai/wan-2.1-t2v-720p',
      input: {
        fast_mode: 'Balanced',
        num_frames: 81,
        sample_shift: 5,
        sample_steps: 30,
        frames_per_second: 16,
        sample_guide_scale: 5,
        max_area: '720x1280',
      },
    },
  },
  'kling-v1.6-pro': {
    id: 'kling-v1.6-pro',
    title: 'Kling v1.6 Pro',
    inputType: ['image', 'morph'],
    description: 'Продвинутая анимация (цена за секунду)',
    basePrice: 0.098,
    api: {
      model: 'kwaivgi/kling-v1.6-pro',
      input: {
        prompt_optimizer: true,
        cfg_scale: 0.5,
      },
    },
    imageKey: 'start_image',
    canMorph: true,
  },
  'kling-v1.6-standard': {
    id: 'kling-v1.6-standard',
    title: 'Kling v1.6 Standard',
    inputType: ['image', 'morph'],
    description:
      'Стандартная анимация Kling с поддержкой морфинга (цена за секунду)',
    basePrice: 0.056,
    api: {
      model: 'kwaivgi/kling-v1.6-standard',
      input: {},
    },
    imageKey: 'start_image',
    canMorph: true,
  },
  'kling-v2.0': {
    id: 'kling-v2.0',
    title: 'Kling v2.0',
    inputType: ['image'],
    description:
      'Новейшая модель Kling (только для image-to-video, морфинг НЕ поддерживается)',
    basePrice: 0.28,
    api: {
      model: 'kwaivgi/kling-v2.0',
      input: {},
    },
    imageKey: 'start_image',
    canMorph: false,
  },
  'hunyuan-video-fast': {
    id: 'hunyuan-video-fast',
    title: 'Hunyuan Video Fast',
    inputType: ['text'],
    description: 'Быстрая анимация с оптимизацией промптов',
    basePrice: 0.2,
    api: {
      model: 'wavespeedai/hunyuan-video-fast',
      input: {
        prompt_optimizer: true,
      },
    },
  },
  'seedance-1-pro': {
    id: 'seedance-1-pro',
    title: 'Seedance Pro',
    inputType: ['text', 'image'],
    description:
      'ByteDance Seedance Pro модель для создания видео 5-10 секунд с выбором разрешения',
    basePrice: 0.03, // базовая цена за 480p, будет пересчитана при выборе разрешения
    api: {
      model: 'bytedance/seedance-1-pro',
      input: {
        duration: 5, // стандартная длительность 5 секунд
        fps: 24, // стандартная частота кадров
        // resolution будет добавлено динамически
      },
    },
    imageKey: 'image', // ИСПРАВЛЕНО: по документации должно быть 'image', а не 'first_frame_image'
    canMorph: false,
    resolutionOptions: ['480p', '1080p'], // новое поле для поддержки выбора разрешения
    priceByResolution: {
      '480p': 0.03,
      '1080p': 0.15,
    },
  },
  'wan-2.2-t2v-fast': {
    id: 'wan-2.2-t2v-fast',
    title: 'WAN 2.2 T2V Fast',
    inputType: ['text'],
    description:
      '💨 БЫСТРО: WAN 2.2 Text-to-Video - от 12⭐ (480p) до 26⭐ (1080p)',
    basePrice: 0.03627, // Базовая цена для 720p (17⭐)
    api: {
      model: 'wan-video/wan-2.2-t2v-fast',
      input: {
        target_resolution: '720p', // По умолчанию 720p
      },
    },
    resolutionOptions: ['480p', '720p', '1080p'],
    priceByResolution: {
      '480p': 0.0256, // 12⭐ = (12 * 0.016) / (5 * 1.5)
      '720p': 0.03627, // 17⭐ = (17 * 0.016) / (5 * 1.5)
      '1080p': 0.05547, // 26⭐ = (26 * 0.016) / (5 * 1.5)
    },
    canMorph: false,
  },
  'wan-2.2-i2v-fast': {
    id: 'wan-2.2-i2v-fast',
    title: 'WAN 2.2 I2V Fast',
    inputType: ['image'],
    description:
      '💨 БЫСТРО: WAN 2.2 Image-to-Video - от 11⭐ (480p) до 23⭐ (1080p)',
    basePrice: 0.032, // Базовая цена для 720p (15⭐)
    api: {
      model: 'wan-video/wan-2.2-i2v-fast',
      input: {
        target_resolution: '720p', // По умолчанию 720p
      },
    },
    resolutionOptions: ['480p', '720p', '1080p'],
    priceByResolution: {
      '480p': 0.02347, // 11⭐ = (11 * 0.016) / (5 * 1.5)
      '720p': 0.032, // 15⭐ = (15 * 0.016) / (5 * 1.5)
      '1080p': 0.04907, // 23⭐ = (23 * 0.016) / (5 * 1.5)
    },
    imageKey: 'image',
    canMorph: false,
  },


  'veo3_fast': {
    id: 'veo3_fast',
    title: 'VEO3 Fast',
    inputType: ['text'],
    description:
      '🚀 БЫСТРО: 8 сек, быстрая генерация (2-3 мин) - 200⭐',
    basePrice: 0.40, // $0.05 * 8 сек = $0.40 USD за 8 секунд
    api: {
      model: 'veo3_fast',
      input: {
        duration: 8, // Фиксированная длительность 8 секунд
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : userAspect === '1:1' ? '1:1' : '16:9', // Поддержка 9:16, 16:9 и 1:1
      },
    },
    canMorph: false,
    aspectRatioOptions: ['16:9', '9:16', '1:1'], // Поддерживаемые форматы
  },
  'veo3': {
    id: 'veo3',
    title: 'VEO3 Standard',
    inputType: ['text'],
    description:
      '⭐ ПРЕМИУМ: 10 сек, высокое качество (5-10 мин) - 750⭐',
    basePrice: 1.50, // $0.15 * 10 сек = $1.50 USD за 10 секунд
    api: {
      model: 'veo3',
      input: {
        duration: 10, // Длительность по умолчанию 10 секунд
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : userAspect === '1:1' ? '1:1' : '16:9', // Поддержка 9:16, 16:9 и 1:1
      },
    },
    canMorph: false,
    aspectRatioOptions: ['16:9', '9:16', '1:1'], // Поддерживаемые форматы
    durationOptions: [5, 10, 15, 20, 25, 30], // Поддерживаемые длительности
    priceByDuration: {
      5: 0.75,   // $0.15 * 5 = $0.75
      10: 1.50,  // $0.15 * 10 = $1.50
      15: 2.25,  // $0.15 * 15 = $2.25
      20: 3.00,  // $0.15 * 20 = $3.00
      25: 3.75,  // $0.15 * 25 = $3.75
      30: 4.50,  // $0.15 * 30 = $4.50
    },
  },
  'runway-aleph': {
    id: 'runway-aleph',
    title: 'Runway Aleph',
    inputType: ['text', 'image'],
    description:
      '🎬 ПРЕМИУМ: Runway Aleph - 182⭐ за 6 сек (конкурентная цена!)',
    basePrice: 0.485, // Конкурентная цена: 182⭐ за 6 сек = $2.912 за 6 сек = $0.485/сек
    api: {
      model: 'runwayml/gen-3-alpha',
      input: {
        duration: 6, // Длительность по умолчанию
        aspect_ratio: (userAspect: string) =>
          userAspect === '9:16' ? '9:16' : '16:9', // Поддержка 9:16 и 16:9
      },
    },
    imageKey: 'image',
    canMorph: false,
    aspectRatioOptions: ['16:9', '9:16'], // Поддерживаемые соотношения сторон
  },
}

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

// Используем ключи конфига как основу для цен
export const videoModelPrices: Record<VideoModelKey, number> =
  Object.fromEntries(
    Object.entries(VIDEO_MODELS_CONFIG).map(([key, config]) => {
      // Проверяем наличие basePrice на всякий случай
      if (typeof config.basePrice !== 'number') {
        throw new Error(
          `basePrice is missing or not a number for model key: ${key}`
        )
      }
      return [key, config.basePrice]
    })
  ) as Record<VideoModelKey, number>

export const findModelByTitle = (
  title: string,
  type: 'image' | 'text'
): string | undefined => {
  // Ищем модель по тексту кнопки
  console.log('🔍 Поиск модели по тексту:', { title, type })

  // Извлекаем имя модели из текста кнопки (удаляем цену в скобках)
  const modelTitle = title.replace(/\s*\([^)]*\)\s*$/, '').trim()

  console.log('🔍 Нормализованное имя модели:', { modelTitle })

  const foundModel = Object.entries(VIDEO_MODELS_CONFIG).find(([_, model]) => {
    const typeMatch = model.inputType.includes(type)
    const titleMatch = model.title === modelTitle

    console.log(`🔄 Проверка модели ${model.title}:`, {
      typeMatch,
      titleMatch,
      expectedTitle: modelTitle,
      actualTitle: model.title,
    })

    return titleMatch && typeMatch
  })

  if (foundModel) {
    console.log('✅ Модель найдена:', {
      key: foundModel[0],
      title: foundModel[1].title,
    })
    return foundModel[0] // Возвращаем ключ модели
  }

  console.log('❌ Модель не найдена')
  return undefined
}
export const videoModelKeyboard = (
  isRu: boolean,
  inputType: 'text' | 'image'
) => {
  console.log('🎹 Создание клавиатуры для видео-моделей:', {
    description: 'Creating video models keyboard',
    isRu,
    inputType,
  })

  // Фильтруем модели по типу ввода
  const filteredModels = Object.values(VIDEO_MODELS_CONFIG).filter(model => {
    const include = model.inputType.includes(inputType)
    console.log(`🔘 Проверка модели:`, {
      description: 'Checking model',
      modelTitle: model.title,
      modelInputTypes: model.inputType,
      matchesInputType: include,
    })
    return include
  })

  console.log('📋 Отфильтрованные модели:', {
    description: 'Filtered models',
    models: filteredModels.map(m => ({
      title: m.title,
      inputTypes: m.inputType,
    })),
  })

  // Формируем ряды кнопок по 2 в ряд
  const modelButtons: string[][] = []
  for (let i = 0; i < filteredModels.length; i += 2) {
    const row = [filteredModels[i], filteredModels[i + 1]]
      .filter(Boolean)
      .map(model => {
        let price = model.basePrice
        if (model.priceByResolution) {
          // Для моделей с разными разрешениями показываем минимальную цену
          price = Math.min(...Object.values(model.priceByResolution))
        }
        const stars = Math.floor(((price * 5) / 0.016) * 1.5)
        return `${model.title} (${stars} ⭐)`
      })

    if (row.length > 0) {
      modelButtons.push(row)
    }
  }

  // Добавляем последнюю кнопку "Назад в меню"
  const backButtonText = isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'
  modelButtons.push([backButtonText])

  // Создаем клавиатуру
  const keyboard = Markup.keyboard(modelButtons).resize()

  console.log('✅ Клавиатура создана:', {
    description: 'Keyboard created',
    buttonRows: modelButtons,
  })
  return keyboard
}
