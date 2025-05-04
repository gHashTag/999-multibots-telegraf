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
    inputType: ['text', 'image', 'morph'],
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
    inputType: ['text', 'image'],
    description: 'Стандартная анимация Kling (цена за секунду)',
    basePrice: 0.056,
    api: {
      model: 'kwaivgi/kling-v1.6-standard',
      input: {},
    },
    imageKey: 'start_image',
    canMorph: false,
  },
  'kling-v2.0': {
    id: 'kling-v2.0',
    title: 'Kling v2.0',
    inputType: ['text', 'image'],
    description: 'Новейшая модель Kling (цена за секунду)',
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
  // Изменен возвращаемый тип на string | undefined
  console.log('🔍 Поиск модели по заголовку:', {
    inputTitle: title.trim(),
    inputType: type,
  })

  const foundModel = Object.values(VIDEO_MODELS_CONFIG).find(model => {
    const normalizedInput = title.toLowerCase().trim()
    const normalizedModelTitle = model.title.toLowerCase().trim()

    const titleMatch = normalizedModelTitle === normalizedInput
    const typeMatch = model.inputType.includes(type)

    console.log(`🔄 Проверка "${model.title}" [${model.inputType}]:`, {
      titleMatch,
      typeMatch,
    })

    return titleMatch && typeMatch
  })

  const resultId = foundModel?.id
  console.log('🔎 Результат поиска:', resultId || 'Модель не найдена')
  return resultId
}
export const videoModelKeyboard = (
  isRu: boolean,
  inputType: 'text' | 'image'
): Markup.Markup<ReplyKeyboardMarkup> => {
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
    const row = [filteredModels[i].title, filteredModels[i + 1]?.title].filter(
      (title): title is string => Boolean(title)
    )

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
