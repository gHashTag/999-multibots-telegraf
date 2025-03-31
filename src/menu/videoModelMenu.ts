import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'

// models.config.ts
type VideoModelConfig = {
  id: string
  title: string
  description: string
  inputType: ('text' | 'image')[]
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
    inputType: ['text', 'image'],
    description: 'Продвинутая анимация с оптимизацией промптов',
    basePrice: 0.098,
    api: {
      model: 'kwaivgi/kling-v1.6-pro',
      input: {
        prompt_optimizer: true,
        cfg_scale: 0.5,
      },
    },
    imageKey: 'start_image',
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
  const modelButtons = []
  for (let i = 0; i < filteredModels.length; i += 2) {
    const row = [
      Markup.button.text(filteredModels[i].title),
      filteredModels[i + 1]
        ? Markup.button.text(filteredModels[i + 1].title)
        : null,
    ].filter(Boolean)

    if (row.length > 0) {
      modelButtons.push(row)
    }
  }

  // Добавляем служебные кнопки
  modelButtons.push([
    Markup.button.text(isRu ? 'Справка по команде' : 'Help for the command'),
    Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
  ])

  console.log('⌨️ Итоговая клавиатура:', {
    description: 'Final keyboard',
    buttons: modelButtons,
  })

  return Markup.keyboard(modelButtons).resize()
}
